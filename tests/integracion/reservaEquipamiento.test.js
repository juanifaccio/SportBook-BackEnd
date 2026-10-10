const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../../src/app');
const { prisma, verificarBaseDePrueba, limpiar, sembrar, autorizacion } = require('../apoyo/base');

describe('reservas con equipamiento', () => {
  let datos;
  let admin;
  let cliente;
  let turnoSuperpuesto;
  let turnoDeLaTarde;

  before(verificarBaseDePrueba);

  beforeEach(async () => {
    await limpiar();
    datos = await sembrar();
    admin = autorizacion(datos.admin);
    cliente = autorizacion(datos.cliente);

    const otraCancha = await prisma.cancha.create({
      data: { nombre: 'Cancha 3', precioPorHora: 10000, estado: 'DISPONIBLE', tipoCanchaId: datos.tipoCancha.id }
    });

    const turnoDeOtraCancha = (horaInicio, horaFin) =>
      prisma.horario.create({
        data: { fecha: datos.turnoLibre.fecha, horaInicio, horaFin, canchaId: otraCancha.id }
      });

    turnoSuperpuesto = await turnoDeOtraCancha('10:30', '11:30');
    turnoDeLaTarde = await turnoDeOtraCancha('18:00', '19:00');
  });

  after(async () => {
    await limpiar();
    await prisma.$disconnect();
  });

  const reservar = (horarioId, equipamientos) =>
    request(app)
      .post('/api/reservas')
      .set(...cliente)
      .send({ horarioId, equipamientos });

  const pelotas = (cantidad) => [{ equipamientoId: datos.equipamiento.id, cantidad }];

  const disponiblesEn = async (horarioId) => {
    const { body } = await request(app)
      .get(`/api/equipamientos?horarioId=${horarioId}`)
      .set(...cliente);

    return body.find((equipamiento) => equipamiento.id === datos.equipamiento.id).disponibles;
  };

  describe('POST /api/reservas', () => {
    it('guarda el equipamiento con su subtotal', async () => {
      const respuesta = await reservar(datos.turnoLibre.id, pelotas(2));

      assert.equal(respuesta.status, 201);
      assert.equal(respuesta.body.equipamientos.length, 1);
      assert.equal(respuesta.body.equipamientos[0].cantidad, 2);
      assert.equal(respuesta.body.equipamientos[0].subtotal, 3000);
      assert.equal(respuesta.body.equipamientos[0].equipamiento.nombre, 'Pelota de fútbol');
    });

    it('suma el equipamiento al precio total', async () => {
      const { body } = await reservar(datos.turnoLibre.id, pelotas(2));

      assert.equal(body.precioTotal, 15000);
    });

    it('sin equipamiento la reserva queda como siempre', async () => {
      const { body } = await reservar(datos.turnoLibre.id);

      assert.equal(body.precioTotal, 12000);
      assert.deepEqual(body.equipamientos, []);
    });

    it('no descuenta el stock del catálogo', async () => {
      await reservar(datos.turnoLibre.id, pelotas(4));

      const guardado = await prisma.equipamiento.findUnique({ where: { id: datos.equipamiento.id } });

      assert.equal(guardado.stock, 10);
    });

    it('rechaza con 409 más unidades que las que tiene el complejo', async () => {
      const respuesta = await reservar(datos.turnoLibre.id, pelotas(11));

      assert.equal(respuesta.status, 409);
      assert.match(respuesta.body.mensaje, /Pelota de fútbol/);
    });

    it('si el equipamiento no alcanza tampoco toma el turno', async () => {
      await reservar(datos.turnoLibre.id, pelotas(11));

      const turno = await prisma.horario.findUnique({ where: { id: datos.turnoLibre.id } });

      assert.equal(turno.disponible, true);
      assert.equal(await prisma.reserva.count(), 0);
    });

    it('rechaza con 400 un equipamiento que no existe', async () => {
      const respuesta = await reservar(datos.turnoLibre.id, [{ equipamientoId: 999999, cantidad: 1 }]);

      assert.equal(respuesta.status, 400);
    });

    it('rechaza con 400 una cantidad de cero', async () => {
      const respuesta = await reservar(datos.turnoLibre.id, pelotas(0));

      assert.equal(respuesta.status, 400);
    });

    it('rechaza con 400 el mismo artículo dos veces', async () => {
      const respuesta = await reservar(datos.turnoLibre.id, [...pelotas(1), ...pelotas(2)]);

      assert.equal(respuesta.status, 400);
    });
  });

  describe('stock por turno', () => {
    it('dos reservas superpuestas comparten las unidades', async () => {
      await reservar(datos.turnoLibre.id, pelotas(7));

      const respuesta = await reservar(turnoSuperpuesto.id, pelotas(4));

      assert.equal(respuesta.status, 409);
    });

    it('lo que sobra se puede alquilar en un turno superpuesto', async () => {
      await reservar(datos.turnoLibre.id, pelotas(7));

      const respuesta = await reservar(turnoSuperpuesto.id, pelotas(3));

      assert.equal(respuesta.status, 201);
    });

    it('una reserva de otro horario no consume las unidades', async () => {
      await reservar(datos.turnoLibre.id, pelotas(10));

      const respuesta = await reservar(turnoDeLaTarde.id, pelotas(10));

      assert.equal(respuesta.status, 201);
    });

    it('un turno que empieza cuando termina el otro no compite con él', async () => {
      await reservar(datos.turnoLibre.id, pelotas(10));

      const respuesta = await reservar(datos.otroTurnoLibre.id, pelotas(10));

      assert.equal(respuesta.status, 201);
    });

    it('cancelar libera las unidades', async () => {
      const { body: reserva } = await reservar(datos.turnoLibre.id, pelotas(10));

      await request(app).put(`/api/reservas/${reserva.id}/cancelar`).set(...cliente);

      const respuesta = await reservar(turnoSuperpuesto.id, pelotas(10));

      assert.equal(respuesta.status, 201);
    });

    it('dos pedidos simultáneos no se llevan las mismas unidades', async () => {
      const respuestas = await Promise.all([
        reservar(datos.turnoLibre.id, pelotas(6)),
        reservar(turnoSuperpuesto.id, pelotas(6))
      ]);

      const estados = respuestas.map((respuesta) => respuesta.status).sort();

      assert.deepEqual(estados, [201, 409]);
    });
  });

  describe('GET /api/equipamientos?horarioId=', () => {
    it('informa cuántas unidades quedan para el turno', async () => {
      await reservar(datos.turnoLibre.id, pelotas(3));

      assert.equal(await disponiblesEn(turnoSuperpuesto.id), 7);
      assert.equal(await disponiblesEn(turnoDeLaTarde.id), 10);
    });

    it('sin el filtro no agrega las unidades disponibles', async () => {
      const { body } = await request(app).get('/api/equipamientos').set(...cliente);

      assert.equal(body[0].disponibles, undefined);
    });

    it('responde 400 si el turno no es un número', async () => {
      const respuesta = await request(app).get('/api/equipamientos?horarioId=abc').set(...cliente);

      assert.equal(respuesta.status, 400);
    });

    it('responde 404 si el turno no existe', async () => {
      const respuesta = await request(app).get('/api/equipamientos?horarioId=999999').set(...cliente);

      assert.equal(respuesta.status, 404);
    });
  });

  describe('PUT /api/reservas/:id (reprogramar)', () => {
    it('conserva el equipamiento y lo suma al precio del turno nuevo', async () => {
      const { body: reserva } = await reservar(datos.turnoLibre.id, pelotas(2));

      const { body } = await request(app)
        .put(`/api/reservas/${reserva.id}`)
        .set(...cliente)
        .send({ horarioId: turnoDeLaTarde.id });

      assert.equal(body.precioTotal, 13000);
      assert.equal(body.equipamientos[0].cantidad, 2);
    });

    it('rechaza con 409 un turno donde el equipamiento no alcanza', async () => {
      const turnoDeLaTardeEnLaCancha1 = await prisma.horario.create({
        data: { fecha: turnoDeLaTarde.fecha, horaInicio: '18:30', horaFin: '19:30', canchaId: datos.cancha.id }
      });

      await reservar(turnoDeLaTarde.id, pelotas(9));
      const { body: reserva } = await reservar(datos.turnoLibre.id, pelotas(2));

      const respuesta = await request(app)
        .put(`/api/reservas/${reserva.id}`)
        .set(...cliente)
        .send({ horarioId: turnoDeLaTardeEnLaCancha1.id });

      assert.equal(respuesta.status, 409);

      const guardada = await prisma.reserva.findUnique({ where: { id: reserva.id } });

      assert.equal(guardada.horarioId, datos.turnoLibre.id);
    });

    it('no compite consigo misma al moverse a un turno superpuesto', async () => {
      const { body: reserva } = await reservar(datos.turnoLibre.id, pelotas(10));

      const respuesta = await request(app)
        .put(`/api/reservas/${reserva.id}`)
        .set(...cliente)
        .send({ horarioId: turnoSuperpuesto.id });

      assert.equal(respuesta.status, 200);
    });
  });

  describe('pagos', () => {
    it('la reserva se confirma recién cuando el pago cubre también el equipamiento', async () => {
      const { body: reserva } = await reservar(datos.turnoLibre.id, pelotas(2));

      const pagar = (monto) =>
        request(app)
          .post('/api/pagos')
          .set(...admin)
          .send({ reservaId: reserva.id, monto, metodo: 'EFECTIVO' });

      await pagar(12000);

      let guardada = await prisma.reserva.findUnique({ where: { id: reserva.id } });

      assert.equal(guardada.estado, 'PENDIENTE');

      await pagar(3000);

      guardada = await prisma.reserva.findUnique({ where: { id: reserva.id } });

      assert.equal(guardada.estado, 'CONFIRMADA');
    });
  });

  describe('DELETE /api/equipamientos/:id', () => {
    it('no deja borrar un artículo que alguna reserva incluye', async () => {
      await reservar(datos.turnoLibre.id, pelotas(1));

      const respuesta = await request(app)
        .delete(`/api/equipamientos/${datos.equipamiento.id}`)
        .set(...admin);

      assert.equal(respuesta.status, 409);
    });
  });
});

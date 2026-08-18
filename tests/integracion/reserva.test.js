const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../../src/app');
const { prisma, verificarBaseDePrueba, limpiar, sembrar, autorizacion } = require('../apoyo/base');

/**
 * El caso de uso central, de punta a punta: reservar un turno, gestionarlo y
 * cancelarlo, con las reglas de quién puede hacer qué sobre la reserva de quién.
 */
describe('reservas', () => {
  let datos;
  let admin;
  let cliente;
  let otroCliente;

  before(verificarBaseDePrueba);

  beforeEach(async () => {
    await limpiar();
    datos = await sembrar();
    admin = autorizacion(datos.admin);
    cliente = autorizacion(datos.cliente);
    otroCliente = autorizacion(datos.otroCliente);
  });

  after(async () => {
    await limpiar();
    await prisma.$disconnect();
  });

  /** Reserva creada por la API, que es como nacen todas. */
  const reservar = (autorizacionDeQuien, cuerpo) =>
    request(app)
      .post('/api/reservas')
      .set(...autorizacionDeQuien)
      .send(cuerpo);

  const dia = (fecha) => fecha.toISOString().slice(0, 10);

  describe('POST /api/reservas', () => {
    it('reserva el turno a nombre de quien tiene la sesión', async () => {
      const respuesta = await reservar(cliente, { horarioId: datos.turnoLibre.id });

      assert.equal(respuesta.status, 201);
      assert.equal(respuesta.body.usuarioId, datos.cliente.id);
      // Nace PENDIENTE: la confirma el pago, no el alta. Ver `pago.test.js`.
      assert.equal(respuesta.body.estado, 'PENDIENTE');
    });

    // La fecha, las horas, la cancha y el precio los deriva el backend del turno:
    // un total que llega del navegador no se puede creer.
    it('copia del turno la fecha, las horas y la cancha', async () => {
      const { body } = await reservar(cliente, { horarioId: datos.turnoLibre.id });

      assert.equal(body.fecha, dia(datos.turnoLibre.fecha));
      assert.equal(body.horaInicio, datos.turnoLibre.horaInicio);
      assert.equal(body.horaFin, datos.turnoLibre.horaFin);
      assert.equal(body.canchaId, datos.cancha.id);
      assert.equal(body.horarioId, datos.turnoLibre.id);
    });

    it('calcula el total con el precio por hora y la duración', async () => {
      const unaHora = await reservar(cliente, { horarioId: datos.turnoLibre.id });
      const horaYMedia = await reservar(cliente, { horarioId: datos.otroTurnoLibre.id });

      // La cancha vale 12000 la hora.
      assert.equal(unaHora.body.precioTotal, 12000);
      assert.equal(horaYMedia.body.precioTotal, 18000);
    });

    it('ignora el precio que mande el cliente', async () => {
      const { body } = await reservar(cliente, { horarioId: datos.turnoLibre.id, precioTotal: 1 });

      assert.equal(body.precioTotal, 12000);
    });

    it('marca el turno como ocupado', async () => {
      await reservar(cliente, { horarioId: datos.turnoLibre.id });

      const turno = await prisma.horario.findUnique({ where: { id: datos.turnoLibre.id } });

      assert.equal(turno.disponible, false);
    });

    // El candado contra la doble reserva: un `updateMany` filtrado por
    // `disponible: true` dentro de la misma transacción que crea la reserva.
    it('no deja reservar dos veces el mismo turno', async () => {
      await reservar(cliente, { horarioId: datos.turnoLibre.id });

      const segunda = await reservar(otroCliente, { horarioId: datos.turnoLibre.id });

      assert.equal(segunda.status, 409);
      assert.match(segunda.body.mensaje, /ya fue reservado/);
    });

    it('no crea la reserva perdedora cuando el turno ya estaba tomado', async () => {
      await reservar(cliente, { horarioId: datos.turnoLibre.id });
      await reservar(otroCliente, { horarioId: datos.turnoLibre.id });

      assert.equal(await prisma.reserva.count(), 1);
    });

    // El dueño sale de la sesión, no del cuerpo: si viniera del cliente,
    // cualquiera podría reservar a nombre de otro.
    it('el cliente no puede reservar a nombre de otro', async () => {
      const { body } = await reservar(cliente, {
        horarioId: datos.turnoLibre.id,
        usuarioId: datos.otroCliente.id
      });

      assert.equal(body.usuarioId, datos.cliente.id);
    });

    // La excepción: el administrador reserva desde el mostrador para quien se lo
    // pide, así que es el único que puede mandar `usuarioId`.
    it('el administrador sí puede reservar a nombre de otro', async () => {
      const respuesta = await reservar(admin, {
        horarioId: datos.turnoLibre.id,
        usuarioId: datos.cliente.id
      });

      assert.equal(respuesta.status, 201);
      assert.equal(respuesta.body.usuarioId, datos.cliente.id);
    });

    it('el administrador tiene que decir para quién reserva', async () => {
      const respuesta = await reservar(admin, { horarioId: datos.turnoLibre.id });

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /usuario/);
    });

    it('pide el turno', async () => {
      assert.equal((await reservar(cliente, {})).status, 400);
    });

    it('rechaza con 400 un turno que no existe', async () => {
      const respuesta = await reservar(cliente, { horarioId: 999999 });

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /no existe/);
    });

    it('rechaza el turno de una cancha en mantenimiento', async () => {
      const respuesta = await reservar(cliente, { horarioId: datos.turnoEnMantenimiento.id });

      assert.equal(respuesta.status, 409);
      assert.match(respuesta.body.mensaje, /mantenimiento/);
    });

    it('rechaza un turno que ya empezó', async () => {
      const respuesta = await reservar(cliente, { horarioId: datos.turnoPasado.id });

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /ya empezó/);
    });

    it('no deja reservar para un usuario dado de baja', async () => {
      const respuesta = await reservar(admin, {
        horarioId: datos.turnoLibre.id,
        usuarioId: datos.inactivo.id
      });

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /baja/);
    });
  });

  describe('GET /api/reservas', () => {
    beforeEach(async () => {
      await reservar(cliente, { horarioId: datos.turnoLibre.id });
      await reservar(otroCliente, { horarioId: datos.otroTurnoLibre.id });
    });

    it('el administrador ve todas', async () => {
      const respuesta = await request(app).get('/api/reservas').set(...admin);

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.length, 2);
    });

    it('el cliente ve solamente las suyas', async () => {
      const respuesta = await request(app).get('/api/reservas').set(...cliente);

      assert.equal(respuesta.body.length, 1);
      assert.equal(respuesta.body[0].usuarioId, datos.cliente.id);
    });

    // El filtro `?usuarioId=` es del listado de administración. Para el cliente
    // el listado es siempre el suyo, así que se le pisa: mandar el id de otro no
    // cambia nada.
    it('el cliente no puede espiar las de otro por query param', async () => {
      const respuesta = await request(app)
        .get(`/api/reservas?usuarioId=${datos.otroCliente.id}`)
        .set(...cliente);

      assert.equal(respuesta.body.length, 1);
      assert.equal(respuesta.body[0].usuarioId, datos.cliente.id);
    });

    it('el administrador sí puede filtrar por usuario', async () => {
      const respuesta = await request(app)
        .get(`/api/reservas?usuarioId=${datos.otroCliente.id}`)
        .set(...admin);

      assert.equal(respuesta.body.length, 1);
      assert.equal(respuesta.body[0].usuarioId, datos.otroCliente.id);
    });

    it('filtra por cancha, día y estado', async () => {
      const porCancha = await request(app).get(`/api/reservas?canchaId=${datos.cancha.id}`).set(...admin);
      const porDia = await request(app).get(`/api/reservas?fecha=${dia(datos.turnoLibre.fecha)}`).set(...admin);
      const canceladas = await request(app).get('/api/reservas?estado=CANCELADA').set(...admin);

      assert.equal(porCancha.body.length, 2);
      assert.equal(porDia.body.length, 2);
      assert.equal(canceladas.body.length, 0);
    });

    it('rechaza un filtro de estado que no existe', async () => {
      assert.equal((await request(app).get('/api/reservas?estado=ANULADA').set(...admin)).status, 400);
    });

    // El usuario viaja anidado dentro de la reserva, donde el controller de
    // usuarios no puede hacer nada por él.
    it('no filtra la contraseña del usuario incluido', async () => {
      const respuesta = await request(app).get('/api/reservas').set(...admin);

      for (const reserva of respuesta.body) {
        assert.equal('contrasena' in reserva.usuario, false);
      }
    });
  });

  describe('GET /api/reservas/:id', () => {
    let reserva;

    beforeEach(async () => {
      const { body } = await reservar(cliente, { horarioId: datos.turnoLibre.id });
      reserva = body;
    });

    it('el dueño ve su reserva', async () => {
      const respuesta = await request(app).get(`/api/reservas/${reserva.id}`).set(...cliente);

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.id, reserva.id);
    });

    it('el administrador ve la de cualquiera', async () => {
      assert.equal((await request(app).get(`/api/reservas/${reserva.id}`).set(...admin)).status, 200);
    });

    it('otro cliente no la ve', async () => {
      const respuesta = await request(app).get(`/api/reservas/${reserva.id}`).set(...otroCliente);

      assert.equal(respuesta.status, 403);
      assert.match(respuesta.body.mensaje, /otro usuario/);
    });

    it('responde 404 si el id no existe', async () => {
      assert.equal((await request(app).get('/api/reservas/999999').set(...admin)).status, 404);
    });
  });

  describe('PUT /api/reservas/:id — reprogramar', () => {
    let reserva;

    beforeEach(async () => {
      const { body } = await reservar(cliente, { horarioId: datos.turnoLibre.id });
      reserva = body;
    });

    const reprogramar = (autorizacionDeQuien, horarioId) =>
      request(app)
        .put(`/api/reservas/${reserva.id}`)
        .set(...autorizacionDeQuien)
        .send({ horarioId });

    it('mueve la reserva al turno nuevo', async () => {
      const respuesta = await reprogramar(cliente, datos.otroTurnoLibre.id);

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.horarioId, datos.otroTurnoLibre.id);
    });

    // Los datos del turno son una copia: si solo se cambiara el `horarioId`, la
    // reserva quedaría mostrando el horario y el precio del turno viejo.
    it('vuelve a copiar las horas y el precio del turno nuevo', async () => {
      const { body } = await reprogramar(cliente, datos.otroTurnoLibre.id);

      assert.equal(body.horaInicio, datos.otroTurnoLibre.horaInicio);
      assert.equal(body.horaFin, datos.otroTurnoLibre.horaFin);
      assert.equal(body.precioTotal, 18000);
    });

    it('toma el turno nuevo y devuelve el viejo a la lista de libres', async () => {
      await reprogramar(cliente, datos.otroTurnoLibre.id);

      const viejo = await prisma.horario.findUnique({ where: { id: datos.turnoLibre.id } });
      const nuevo = await prisma.horario.findUnique({ where: { id: datos.otroTurnoLibre.id } });

      assert.equal(viejo.disponible, true);
      assert.equal(nuevo.disponible, false);
    });

    // Sin este control, reprogramar al mismo turno lo liberaría después de
    // haberlo tomado y la reserva quedaría ocupando un turno marcado como libre.
    it('rechaza reprogramar al mismo turno en el que ya está', async () => {
      const respuesta = await reprogramar(cliente, datos.turnoLibre.id);

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /ya está en ese turno/);
    });

    it('rechaza un turno que ya reservó otro', async () => {
      await reservar(otroCliente, { horarioId: datos.otroTurnoLibre.id });

      const respuesta = await reprogramar(cliente, datos.otroTurnoLibre.id);

      assert.equal(respuesta.status, 409);
    });

    it('deja la reserva donde estaba si el turno nuevo no se pudo tomar', async () => {
      await reservar(otroCliente, { horarioId: datos.otroTurnoLibre.id });
      await reprogramar(cliente, datos.otroTurnoLibre.id);

      const sinCambios = await prisma.reserva.findUnique({ where: { id: reserva.id } });
      const turnoViejo = await prisma.horario.findUnique({ where: { id: datos.turnoLibre.id } });

      assert.equal(sinCambios.horarioId, datos.turnoLibre.id);
      assert.equal(turnoViejo.disponible, false);
    });

    it('rechaza el turno de una cancha en mantenimiento', async () => {
      assert.equal((await reprogramar(cliente, datos.turnoEnMantenimiento.id)).status, 409);
    });

    it('otro cliente no puede reprogramarla', async () => {
      const respuesta = await reprogramar(otroCliente, datos.otroTurnoLibre.id);

      assert.equal(respuesta.status, 403);
    });

    it('el administrador sí puede', async () => {
      assert.equal((await reprogramar(admin, datos.otroTurnoLibre.id)).status, 200);
    });
  });

  describe('PUT /api/reservas/:id/cancelar', () => {
    let reserva;

    beforeEach(async () => {
      const { body } = await reservar(cliente, { horarioId: datos.turnoLibre.id });
      reserva = body;
    });

    const cancelar = (autorizacionDeQuien) =>
      request(app)
        .put(`/api/reservas/${reserva.id}/cancelar`)
        .set(...autorizacionDeQuien);

    it('deja la reserva en CANCELADA', async () => {
      const respuesta = await cancelar(cliente);

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.estado, 'CANCELADA');
    });

    // Cancelar no es borrar: la fila se conserva como historial y lo que se
    // libera es el turno. Por eso el recurso no tiene DELETE.
    it('conserva la fila y devuelve el turno a la lista de libres', async () => {
      await cancelar(cliente);

      const turno = await prisma.horario.findUnique({ where: { id: datos.turnoLibre.id } });

      assert.equal(turno.disponible, true);
      assert.notEqual(await prisma.reserva.findUnique({ where: { id: reserva.id } }), null);
    });

    // El motivo por el que `horarioId` no lleva `@unique`: el turno liberado
    // tiene que poder reservarse de nuevo, y ya hay una reserva apuntándolo.
    it('el turno liberado se puede volver a reservar', async () => {
      await cancelar(cliente);

      const nueva = await reservar(otroCliente, { horarioId: datos.turnoLibre.id });

      assert.equal(nueva.status, 201);
    });

    it('no se puede cancelar dos veces', async () => {
      await cancelar(cliente);

      const otraVez = await cancelar(cliente);

      assert.equal(otraVez.status, 409);
      assert.match(otraVez.body.mensaje, /ya está cancelada/);
    });

    it('otro cliente no puede cancelarla', async () => {
      const respuesta = await cancelar(otroCliente);

      assert.equal(respuesta.status, 403);
      assert.equal((await prisma.reserva.findUnique({ where: { id: reserva.id } })).estado, 'PENDIENTE');
    });

    it('el administrador sí puede', async () => {
      assert.equal((await cancelar(admin)).status, 200);
    });
  });

  describe('una reserva que ya empezó', () => {
    let vieja;

    beforeEach(async () => {
      // No se puede crear por la API —justamente porque el turno ya pasó—, así
      // que se inserta directo: es el estado en el que queda cualquier reserva
      // cuando le llega la hora.
      await prisma.horario.update({ where: { id: datos.turnoPasado.id }, data: { disponible: false } });

      vieja = await prisma.reserva.create({
        data: {
          fecha: datos.turnoPasado.fecha,
          horaInicio: datos.turnoPasado.horaInicio,
          horaFin: datos.turnoPasado.horaFin,
          estado: 'CONFIRMADA',
          precioTotal: 12000,
          usuarioId: datos.cliente.id,
          canchaId: datos.cancha.id,
          horarioId: datos.turnoPasado.id
        }
      });
    });

    // Es historia: cancelarla liberaría un turno que ya no le sirve a nadie, y
    // reprogramarla reescribiría lo que efectivamente pasó.
    it('no se puede cancelar', async () => {
      const respuesta = await request(app).put(`/api/reservas/${vieja.id}/cancelar`).set(...cliente);

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /ya empezó/);
    });

    it('no se puede reprogramar', async () => {
      const respuesta = await request(app)
        .put(`/api/reservas/${vieja.id}`)
        .set(...cliente)
        .send({ horarioId: datos.turnoLibre.id });

      assert.equal(respuesta.status, 400);
    });

    // El permiso se evalúa antes que el estado: a un cliente ajeno ni siquiera le
    // corresponde enterarse de en qué situación está la reserva de otro.
    it('a otro cliente le responde 403 y no el motivo real', async () => {
      const respuesta = await request(app).put(`/api/reservas/${vieja.id}/cancelar`).set(...otroCliente);

      assert.equal(respuesta.status, 403);
    });

    it('sigue apareciendo en el listado de su dueño', async () => {
      const respuesta = await request(app).get('/api/reservas').set(...cliente);

      assert.equal(respuesta.body.length, 1);
      assert.equal(respuesta.body[0].id, vieja.id);
    });
  });
});

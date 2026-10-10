const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../../src/app');
const { prisma, verificarBaseDePrueba, limpiar, sembrar, autorizacion } = require('../apoyo/base');
const { diaRelativo } = require('../apoyo/fechas');

const MANANA = diaRelativo(1);
const OTRO_DIA = diaRelativo(30);

describe('turnos de una cancha', () => {
  let datos;
  let admin;

  before(verificarBaseDePrueba);

  beforeEach(async () => {
    await limpiar();
    datos = await sembrar();
    admin = autorizacion(datos.admin);
  });

  after(async () => {
    await limpiar();
    await prisma.$disconnect();
  });

  const reservar = async (horario) => {
    const respuesta = await request(app)
      .post('/api/reservas')
      .set(...autorizacion(datos.cliente))
      .send({ horarioId: horario.id });

    assert.equal(respuesta.status, 201);

    return respuesta.body;
  };

  const cancelar = async (reserva) => {
    const respuesta = await request(app)
      .put(`/api/reservas/${reserva.id}/cancelar`)
      .set(...autorizacion(datos.cliente));

    assert.equal(respuesta.status, 200);
  };

  const sinCambios = (cambios = {}) => ({
    fecha: datos.turnoLibre.fecha.toISOString().slice(0, 10),
    horaInicio: datos.turnoLibre.horaInicio,
    horaFin: datos.turnoLibre.horaFin,
    canchaId: datos.cancha.id,
    ...cambios
  });

  const turno = (cambios = {}) => ({
    fecha: OTRO_DIA,
    horaInicio: '18:00',
    horaFin: '19:00',
    canchaId: datos.cancha.id,
    ...cambios
  });

  describe('POST /api/horarios', () => {
    it('carga el turno y lo devuelve con la fecha como la mandó el cliente', async () => {
      const respuesta = await request(app)
        .post('/api/horarios')
        .set(...admin)
        .send(turno());

      assert.equal(respuesta.status, 201);
      assert.equal(respuesta.body.fecha, OTRO_DIA);
      assert.equal(respuesta.body.disponible, true);
    });

    it('devuelve el precio de la cancha incluida como número', async () => {
      const respuesta = await request(app)
        .post('/api/horarios')
        .set(...admin)
        .send(turno());

      assert.equal(typeof respuesta.body.cancha.precioPorHora, 'number');
    });

    it('rechaza un turno que se superpone con otro de la misma cancha', async () => {
      await request(app).post('/api/horarios').set(...admin).send(turno());

      const respuesta = await request(app)
        .post('/api/horarios')
        .set(...admin)
        .send(turno({ horaInicio: '18:30', horaFin: '19:30' }));

      assert.equal(respuesta.status, 409);
      assert.match(respuesta.body.mensaje, /superpone/);
    });

    it('rechaza un turno que contiene a otro', async () => {
      await request(app).post('/api/horarios').set(...admin).send(turno());

      const respuesta = await request(app)
        .post('/api/horarios')
        .set(...admin)
        .send(turno({ horaInicio: '17:00', horaFin: '20:00' }));

      assert.equal(respuesta.status, 409);
    });

    it('acepta un turno que arranca justo cuando termina el anterior', async () => {
      await request(app).post('/api/horarios').set(...admin).send(turno());

      const respuesta = await request(app)
        .post('/api/horarios')
        .set(...admin)
        .send(turno({ horaInicio: '19:00', horaFin: '20:00' }));

      assert.equal(respuesta.status, 201);
    });

    it('acepta el mismo horario en otra cancha', async () => {
      await request(app).post('/api/horarios').set(...admin).send(turno());

      const respuesta = await request(app)
        .post('/api/horarios')
        .set(...admin)
        .send(turno({ canchaId: datos.canchaEnMantenimiento.id }));

      assert.equal(respuesta.status, 201);
    });

    it('acepta el mismo horario otro día', async () => {
      await request(app).post('/api/horarios').set(...admin).send(turno());

      const respuesta = await request(app)
        .post('/api/horarios')
        .set(...admin)
        .send(turno({ fecha: diaRelativo(31) }));

      assert.equal(respuesta.status, 201);
    });

    it('rechaza con 400 una cancha que no existe', async () => {
      const respuesta = await request(app)
        .post('/api/horarios')
        .set(...admin)
        .send(turno({ canchaId: 999999 }));

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /no existe/);
    });

    it('rechaza una fecha con otro formato', async () => {
      const respuesta = await request(app)
        .post('/api/horarios')
        .set(...admin)
        .send(turno({ fecha: '15/09/2026' }));

      assert.equal(respuesta.status, 400);
    });

    it('rechaza el turno que termina antes de empezar', async () => {
      const respuesta = await request(app)
        .post('/api/horarios')
        .set(...admin)
        .send(turno({ horaInicio: '19:00', horaFin: '18:00' }));

      assert.equal(respuesta.status, 400);
    });
  });

  describe('POST /api/horarios/lote', () => {
    const lote = (cambios = {}) => ({
      fecha: OTRO_DIA,
      horaInicio: '08:00',
      horaFin: '12:00',
      canchaId: datos.cancha.id,
      duracion: 60,
      ...cambios
    });

    it('crea todos los turnos del rango de una sola vez', async () => {
      const respuesta = await request(app)
        .post('/api/horarios/lote')
        .set(...admin)
        .send(lote());

      assert.equal(respuesta.status, 201);
      assert.equal(respuesta.body.creados.length, 4);
      assert.equal(respuesta.body.omitidos, 0);
      assert.deepEqual(
        respuesta.body.creados.map((turno) => `${turno.horaInicio}-${turno.horaFin}`),
        ['08:00-09:00', '09:00-10:00', '10:00-11:00', '11:00-12:00']
      );
    });

    it('deja los turnos generados con el mismo formato que un alta suelta', async () => {
      const respuesta = await request(app)
        .post('/api/horarios/lote')
        .set(...admin)
        .send(lote());

      const [primero] = respuesta.body.creados;

      assert.equal(primero.fecha, OTRO_DIA);
      assert.equal(primero.disponible, true);
      assert.equal(primero.canchaId, datos.cancha.id);
      assert.equal(typeof primero.cancha.precioPorHora, 'number');
    });

    it('los turnos generados quedan guardados y salen en el listado', async () => {
      await request(app).post('/api/horarios/lote').set(...admin).send(lote());

      const respuesta = await request(app)
        .get(`/api/horarios?canchaId=${datos.cancha.id}&fecha=${OTRO_DIA}`)
        .set(...admin);

      assert.equal(respuesta.body.length, 4);
    });

    it('saltea los turnos que se pisan con los ya cargados y crea el resto', async () => {
      const respuesta = await request(app)
        .post('/api/horarios/lote')
        .set(...admin)
        .send(lote({ fecha: MANANA, horaInicio: '08:00', horaFin: '13:00' }));

      assert.equal(respuesta.status, 201);
      assert.deepEqual(
        respuesta.body.creados.map((turno) => turno.horaInicio),
        ['08:00', '09:00']
      );
      assert.equal(respuesta.body.omitidos, 3);
    });

    it('no toca los turnos que ya estaban cargados', async () => {
      await request(app)
        .post('/api/horarios/lote')
        .set(...admin)
        .send(lote({ fecha: MANANA, horaInicio: '08:00', horaFin: '13:00' }));

      const guardado = await prisma.horario.findUnique({
        where: { id: datos.otroTurnoLibre.id }
      });

      assert.equal(guardado.horaFin, '12:30');
    });

    it('rechaza el lote en el que no queda ningún turno por crear', async () => {
      const respuesta = await request(app)
        .post('/api/horarios/lote')
        .set(...admin)
        .send(lote({ fecha: MANANA, horaInicio: '10:00', horaFin: '11:00' }));

      assert.equal(respuesta.status, 409);
      assert.match(respuesta.body.mensaje, /ya estaban cargados/);
    });

    it('no crea nada cuando responde que ya estaban todos', async () => {
      await request(app)
        .post('/api/horarios/lote')
        .set(...admin)
        .send(lote({ fecha: MANANA, horaInicio: '10:00', horaFin: '11:00' }));

      const cuantos = await prisma.horario.count({
        where: { canchaId: datos.cancha.id, fecha: new Date(MANANA) }
      });

      assert.equal(cuantos, 2);
    });

    it('rechaza el rango más corto que la duración del turno', async () => {
      const respuesta = await request(app)
        .post('/api/horarios/lote')
        .set(...admin)
        .send(lote({ horaFin: '08:30', duracion: 60 }));

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /más corto/);
    });

    it('rechaza el lote sin duración', async () => {
      const respuesta = await request(app)
        .post('/api/horarios/lote')
        .set(...admin)
        .send(lote({ duracion: undefined }));

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /duración/);
    });

    it('rechaza el lote de una cancha que no existe', async () => {
      const respuesta = await request(app)
        .post('/api/horarios/lote')
        .set(...admin)
        .send(lote({ canchaId: 999999 }));

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /no existe/);
    });

    it('no crea ningún turno cuando el lote se rechaza', async () => {
      await request(app)
        .post('/api/horarios/lote')
        .set(...admin)
        .send(lote({ duracion: 5 }));

      const cuantos = await prisma.horario.count({
        where: { canchaId: datos.cancha.id, fecha: new Date(OTRO_DIA) }
      });

      assert.equal(cuantos, 0);
    });

    it('le niega la generación al cliente', async () => {
      const respuesta = await request(app)
        .post('/api/horarios/lote')
        .set(...autorizacion(datos.cliente))
        .send(lote());

      assert.equal(respuesta.status, 403);
    });

    it('le niega la generación a quien no tiene sesión', async () => {
      const respuesta = await request(app).post('/api/horarios/lote').send(lote());

      assert.equal(respuesta.status, 401);
    });
  });

  describe('GET /api/horarios', () => {
    it('filtra por cancha', async () => {
      const respuesta = await request(app)
        .get(`/api/horarios?canchaId=${datos.canchaEnMantenimiento.id}`)
        .set(...admin);

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.length, 1);
      assert.equal(respuesta.body[0].id, datos.turnoEnMantenimiento.id);
    });

    it('filtra por día y disponibilidad', async () => {
      await prisma.horario.update({ where: { id: datos.otroTurnoLibre.id }, data: { disponible: false } });

      const respuesta = await request(app)
        .get(`/api/horarios?canchaId=${datos.cancha.id}&fecha=${datos.turnoLibre.fecha.toISOString().slice(0, 10)}&disponible=true`)
        .set(...admin);

      assert.equal(respuesta.body.length, 1);
      assert.equal(respuesta.body[0].id, datos.turnoLibre.id);
    });

    it('rechaza un filtro de cancha que no es un número', async () => {
      const respuesta = await request(app).get('/api/horarios?canchaId=pepe').set(...admin);

      assert.equal(respuesta.status, 400);
    });

    it('rechaza un filtro de disponibilidad que no es true ni false', async () => {
      const respuesta = await request(app).get('/api/horarios?disponible=quizas').set(...admin);

      assert.equal(respuesta.status, 400);
    });
  });

  describe('PUT /api/horarios/:id', () => {
    it('mueve el turno de horario', async () => {
      const respuesta = await request(app)
        .put(`/api/horarios/${datos.turnoLibre.id}`)
        .set(...admin)
        .send(turno({ horaInicio: '20:00', horaFin: '21:00' }));

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.horaInicio, '20:00');
    });

    it('deja guardar un turno sin cambiarle el horario', async () => {
      const respuesta = await request(app)
        .put(`/api/horarios/${datos.turnoLibre.id}`)
        .set(...admin)
        .send({
          fecha: datos.turnoLibre.fecha.toISOString().slice(0, 10),
          horaInicio: datos.turnoLibre.horaInicio,
          horaFin: datos.turnoLibre.horaFin,
          canchaId: datos.cancha.id
        });

      assert.equal(respuesta.status, 200);
    });

    it('rechaza moverlo encima de otro turno de la misma cancha', async () => {
      const respuesta = await request(app)
        .put(`/api/horarios/${datos.turnoLibre.id}`)
        .set(...admin)
        .send({
          fecha: datos.otroTurnoLibre.fecha.toISOString().slice(0, 10),
          horaInicio: '11:30',
          horaFin: '12:00',
          canchaId: datos.cancha.id
        });

      assert.equal(respuesta.status, 409);
    });

    describe('con una reserva activa', () => {
      beforeEach(async () => {
        await reservar(datos.turnoLibre);
      });

      it('no lo deja volver a ofrecer', async () => {
        const respuesta = await request(app)
          .put(`/api/horarios/${datos.turnoLibre.id}`)
          .set(...admin)
          .send(sinCambios({ disponible: true }));

        assert.equal(respuesta.status, 409);
        assert.match(respuesta.body.mensaje, /reserva activa/);

        const guardado = await prisma.horario.findUnique({ where: { id: datos.turnoLibre.id } });

        assert.equal(guardado.disponible, false);
      });

      it('no lo deja mover de hora', async () => {
        const respuesta = await request(app)
          .put(`/api/horarios/${datos.turnoLibre.id}`)
          .set(...admin)
          .send(sinCambios({ horaInicio: '20:00', horaFin: '21:00', disponible: false }));

        assert.equal(respuesta.status, 409);

        const guardado = await prisma.horario.findUnique({ where: { id: datos.turnoLibre.id } });

        assert.equal(guardado.horaInicio, datos.turnoLibre.horaInicio);
      });

      it('deja guardarlo sin cambios', async () => {
        const respuesta = await request(app)
          .put(`/api/horarios/${datos.turnoLibre.id}`)
          .set(...admin)
          .send(sinCambios({ disponible: false }));

        assert.equal(respuesta.status, 200);
      });

      it('lo deja mover cuando la reserva se cancela', async () => {
        const [reserva] = (await request(app).get('/api/reservas').set(...admin)).body;

        await cancelar(reserva);

        const respuesta = await request(app)
          .put(`/api/horarios/${datos.turnoLibre.id}`)
          .set(...admin)
          .send(sinCambios({ horaInicio: '20:00', horaFin: '21:00' }));

        assert.equal(respuesta.status, 200);
        assert.equal(respuesta.body.horaInicio, '20:00');
      });
    });
  });

  describe('DELETE /api/horarios/:id', () => {
    it('elimina el turno', async () => {
      const respuesta = await request(app).delete(`/api/horarios/${datos.turnoLibre.id}`).set(...admin);

      assert.equal(respuesta.status, 200);
      assert.equal(await prisma.horario.findUnique({ where: { id: datos.turnoLibre.id } }), null);
    });

    it('responde 404 si el id no existe', async () => {
      assert.equal((await request(app).delete('/api/horarios/999999').set(...admin)).status, 404);
    });

    it('no borra un turno reservado, con un 409 que dice por qué', async () => {
      await reservar(datos.turnoLibre);

      const respuesta = await request(app).delete(`/api/horarios/${datos.turnoLibre.id}`).set(...admin);

      assert.equal(respuesta.status, 409);
      assert.match(respuesta.body.mensaje, /reservas asociadas/);
      assert.notEqual(await prisma.horario.findUnique({ where: { id: datos.turnoLibre.id } }), null);
    });

    it('tampoco uno cuya reserva se canceló', async () => {
      await cancelar(await reservar(datos.turnoLibre));

      const respuesta = await request(app).delete(`/api/horarios/${datos.turnoLibre.id}`).set(...admin);

      assert.equal(respuesta.status, 409);
    });
  });
});

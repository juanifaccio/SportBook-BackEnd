const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../../src/app');
const { prisma, verificarBaseDePrueba, limpiar, sembrar, autorizacion } = require('../apoyo/base');
const { diaRelativo } = require('../apoyo/fechas');

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
      // El día tiene que volver igual que como entró: se guarda como DATE y
      // Prisma lo devuelve a medianoche UTC, así que sin recortarlo el huso
      // horario lo correría al día anterior.
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

    // Esta validación es la que mantiene simple el caso de uso de reservar: si
    // los turnos no se pisan, alcanza con elegir uno libre.
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

    // Dos turnos pegados no se solapan: el que termina a las 19:00 deja libre
    // ese instante para el que arranca ahí.
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

    // La cancha llega en el cuerpo, así que un id inexistente es un dato
    // inválido del cliente y no un recurso faltante en la URL.
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

  describe('GET /api/horarios', () => {
    it('filtra por cancha', async () => {
      const respuesta = await request(app)
        .get(`/api/horarios?canchaId=${datos.canchaEnMantenimiento.id}`)
        .set(...admin);

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.length, 1);
      assert.equal(respuesta.body[0].id, datos.turnoEnMantenimiento.id);
    });

    // Es el filtro que usa la pantalla de reservar: los turnos libres de un día.
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

    // Al editar hay que excluir el propio turno de la búsqueda de solapamientos:
    // si no, todo turno se solaparía consigo mismo y nunca se podría guardar.
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
  });
});

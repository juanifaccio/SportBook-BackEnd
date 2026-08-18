const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../../src/app');
const { prisma, verificarBaseDePrueba, limpiar, sembrar, autorizacion } = require('../apoyo/base');

/**
 * El ABM de TipoCancha de punta a punta. Es la implementación de referencia del
 * proyecto, así que se lo recorre entero: lo que se prueba acá es el mismo
 * recorrido que hacen los demás CRUD.
 */
describe('CRUD de tipos de cancha', () => {
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

  describe('POST /api/tipos-cancha', () => {
    it('crea el tipo y lo devuelve con su id', async () => {
      const respuesta = await request(app)
        .post('/api/tipos-cancha')
        .set(...admin)
        .send({ nombre: 'Pádel', descripcion: 'Cancha con paredes' });

      assert.equal(respuesta.status, 201);
      assert.equal(respuesta.body.nombre, 'Pádel');
      assert.ok(respuesta.body.id);
    });

    it('lo deja realmente guardado', async () => {
      const respuesta = await request(app)
        .post('/api/tipos-cancha')
        .set(...admin)
        .send({ nombre: 'Pádel', descripcion: 'Cancha con paredes' });

      const guardado = await prisma.tipoCancha.findUnique({ where: { id: respuesta.body.id } });

      assert.equal(guardado.nombre, 'Pádel');
    });

    it('pide el nombre y la descripción', async () => {
      const respuesta = await request(app)
        .post('/api/tipos-cancha')
        .set(...admin)
        .send({ nombre: 'Pádel' });

      assert.equal(respuesta.status, 400);
    });

    // Es un catálogo: dos filas con el mismo nombre partirían las canchas entre
    // dos ids que significan lo mismo.
    it('no admite dos tipos con el mismo nombre', async () => {
      const respuesta = await request(app)
        .post('/api/tipos-cancha')
        .set(...admin)
        .send({ nombre: datos.tipoCancha.nombre, descripcion: 'Otra descripción' });

      assert.equal(respuesta.status, 409);
    });
  });

  describe('GET /api/tipos-cancha', () => {
    it('lista los tipos cargados', async () => {
      const respuesta = await request(app).get('/api/tipos-cancha').set(...admin);

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.length, 1);
      assert.equal(respuesta.body[0].nombre, datos.tipoCancha.nombre);
    });

    it('devuelve uno por su id', async () => {
      const respuesta = await request(app).get(`/api/tipos-cancha/${datos.tipoCancha.id}`).set(...admin);

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.id, datos.tipoCancha.id);
    });

    it('responde 404 si el id no existe', async () => {
      const respuesta = await request(app).get('/api/tipos-cancha/999999').set(...admin);

      assert.equal(respuesta.status, 404);
    });

    // Un id que no es un número es un pedido mal formado, no un recurso que
    // falta: por eso 400 y no 404.
    it('responde 400 si el id no es un número', async () => {
      const respuesta = await request(app).get('/api/tipos-cancha/pepe').set(...admin);

      assert.equal(respuesta.status, 400);
    });
  });

  describe('PUT /api/tipos-cancha/:id', () => {
    it('actualiza el tipo', async () => {
      const respuesta = await request(app)
        .put(`/api/tipos-cancha/${datos.tipoCancha.id}`)
        .set(...admin)
        .send({ nombre: 'Fútbol 11', descripcion: 'Césped natural' });

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.nombre, 'Fútbol 11');

      const guardado = await prisma.tipoCancha.findUnique({ where: { id: datos.tipoCancha.id } });
      assert.equal(guardado.descripcion, 'Césped natural');
    });

    it('responde 404 si el id no existe', async () => {
      const respuesta = await request(app)
        .put('/api/tipos-cancha/999999')
        .set(...admin)
        .send({ nombre: 'Fútbol 11', descripcion: 'Césped natural' });

      assert.equal(respuesta.status, 404);
    });

    it('no deja pisar el nombre de otro tipo', async () => {
      const otro = await prisma.tipoCancha.create({ data: { nombre: 'Pádel', descripcion: 'Con paredes' } });

      const respuesta = await request(app)
        .put(`/api/tipos-cancha/${otro.id}`)
        .set(...admin)
        .send({ nombre: datos.tipoCancha.nombre, descripcion: 'Con paredes' });

      assert.equal(respuesta.status, 409);
    });
  });

  describe('DELETE /api/tipos-cancha/:id', () => {
    it('elimina un tipo que no tiene canchas', async () => {
      const suelto = await prisma.tipoCancha.create({ data: { nombre: 'Pádel', descripcion: 'Con paredes' } });

      const respuesta = await request(app).delete(`/api/tipos-cancha/${suelto.id}`).set(...admin);

      assert.equal(respuesta.status, 200);
      assert.equal(await prisma.tipoCancha.findUnique({ where: { id: suelto.id } }), null);
    });

    it('responde 404 si el id no existe', async () => {
      const respuesta = await request(app).delete('/api/tipos-cancha/999999').set(...admin);

      assert.equal(respuesta.status, 404);
    });

    // La clave foránea de la base es la que frena el borrado; el controller
    // traduce ese error de Prisma a un 409 con un mensaje que se entienda.
    it('no elimina un tipo que tiene canchas asociadas', async () => {
      const respuesta = await request(app).delete(`/api/tipos-cancha/${datos.tipoCancha.id}`).set(...admin);

      assert.equal(respuesta.status, 409);
      assert.match(respuesta.body.mensaje, /canchas asociadas/);
      assert.notEqual(await prisma.tipoCancha.findUnique({ where: { id: datos.tipoCancha.id } }), null);
    });
  });
});

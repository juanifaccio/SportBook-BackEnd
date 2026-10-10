const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../../src/app');
const { prisma, verificarBaseDePrueba, limpiar, sembrar, autorizacion } = require('../apoyo/base');

describe('CRUD de equipamiento', () => {
  let datos;
  let admin;

  const nuevo = {
    nombre: 'Pechera',
    descripcion: 'Juego de diez, talle único',
    precio: 800,
    stock: 4
  };

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

  describe('POST /api/equipamientos', () => {
    it('crea el equipamiento y lo devuelve con su id', async () => {
      const respuesta = await request(app)
        .post('/api/equipamientos')
        .set(...admin)
        .send(nuevo);

      assert.equal(respuesta.status, 201);
      assert.equal(respuesta.body.nombre, 'Pechera');
      assert.ok(respuesta.body.id);
    });

    it('lo deja realmente guardado', async () => {
      const respuesta = await request(app)
        .post('/api/equipamientos')
        .set(...admin)
        .send(nuevo);

      const guardado = await prisma.equipamiento.findUnique({ where: { id: respuesta.body.id } });

      assert.equal(guardado.nombre, 'Pechera');
      assert.equal(guardado.stock, 4);
    });

    it('devuelve el precio como número y no como texto', async () => {
      const respuesta = await request(app)
        .post('/api/equipamientos')
        .set(...admin)
        .send({ ...nuevo, precio: 1250.5 });

      assert.equal(typeof respuesta.body.precio, 'number');
      assert.equal(respuesta.body.precio, 1250.5);
    });

    it('pide el nombre y la descripción', async () => {
      const respuesta = await request(app)
        .post('/api/equipamientos')
        .set(...admin)
        .send({ precio: 800, stock: 4 });

      assert.equal(respuesta.status, 400);
    });

    it('rechaza un precio de cero o negativo', async () => {
      const respuesta = await request(app)
        .post('/api/equipamientos')
        .set(...admin)
        .send({ ...nuevo, precio: 0 });

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /mayor a cero/);
    });

    it('acepta un stock de cero', async () => {
      const respuesta = await request(app)
        .post('/api/equipamientos')
        .set(...admin)
        .send({ ...nuevo, stock: 0 });

      assert.equal(respuesta.status, 201);
      assert.equal(respuesta.body.stock, 0);
    });

    it('rechaza un stock negativo o con decimales', async () => {
      const negativo = await request(app)
        .post('/api/equipamientos')
        .set(...admin)
        .send({ ...nuevo, stock: -1 });

      const fraccionado = await request(app)
        .post('/api/equipamientos')
        .set(...admin)
        .send({ ...nuevo, stock: 2.5 });

      assert.equal(negativo.status, 400);
      assert.equal(fraccionado.status, 400);
    });

    it('no admite dos equipamientos con el mismo nombre', async () => {
      const respuesta = await request(app)
        .post('/api/equipamientos')
        .set(...admin)
        .send({ ...nuevo, nombre: datos.equipamiento.nombre });

      assert.equal(respuesta.status, 409);
    });
  });

  describe('GET /api/equipamientos', () => {
    it('lista el equipamiento cargado', async () => {
      const respuesta = await request(app).get('/api/equipamientos').set(...admin);

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.length, 1);
      assert.equal(respuesta.body[0].nombre, datos.equipamiento.nombre);
    });

    it('lo devuelve ordenado por nombre', async () => {
      await request(app)
        .post('/api/equipamientos')
        .set(...admin)
        .send({ ...nuevo, nombre: 'Aro de básquet' });

      const respuesta = await request(app).get('/api/equipamientos').set(...admin);

      assert.deepEqual(
        respuesta.body.map((equipamiento) => equipamiento.nombre),
        ['Aro de básquet', 'Pelota de fútbol']
      );
    });

    it('devuelve el precio como número en el listado', async () => {
      const respuesta = await request(app).get('/api/equipamientos').set(...admin);

      assert.equal(typeof respuesta.body[0].precio, 'number');
    });

    it('devuelve uno por su id', async () => {
      const respuesta = await request(app)
        .get(`/api/equipamientos/${datos.equipamiento.id}`)
        .set(...admin);

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.id, datos.equipamiento.id);
    });

    it('responde 404 si el id no existe', async () => {
      const respuesta = await request(app).get('/api/equipamientos/999999').set(...admin);

      assert.equal(respuesta.status, 404);
    });

    it('responde 400 si el id no es un número', async () => {
      const respuesta = await request(app).get('/api/equipamientos/pepe').set(...admin);

      assert.equal(respuesta.status, 400);
    });
  });

  describe('PUT /api/equipamientos/:id', () => {
    it('actualiza el equipamiento', async () => {
      const respuesta = await request(app)
        .put(`/api/equipamientos/${datos.equipamiento.id}`)
        .set(...admin)
        .send({ ...nuevo, nombre: 'Pelota de fútbol', stock: 12 });

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.stock, 12);

      const guardado = await prisma.equipamiento.findUnique({
        where: { id: datos.equipamiento.id }
      });

      assert.equal(guardado.stock, 12);
    });

    it('responde 404 si el id no existe', async () => {
      const respuesta = await request(app)
        .put('/api/equipamientos/999999')
        .set(...admin)
        .send(nuevo);

      assert.equal(respuesta.status, 404);
    });

    it('no deja pisar el nombre de otro equipamiento', async () => {
      const otro = await prisma.equipamiento.create({
        data: { nombre: 'Pechera', descripcion: 'Talle único', precio: 800, stock: 4 }
      });

      const respuesta = await request(app)
        .put(`/api/equipamientos/${otro.id}`)
        .set(...admin)
        .send({ ...nuevo, nombre: datos.equipamiento.nombre });

      assert.equal(respuesta.status, 409);
    });
  });

  describe('DELETE /api/equipamientos/:id', () => {
    it('elimina el equipamiento', async () => {
      const respuesta = await request(app)
        .delete(`/api/equipamientos/${datos.equipamiento.id}`)
        .set(...admin);

      assert.equal(respuesta.status, 200);
      assert.equal(
        await prisma.equipamiento.findUnique({ where: { id: datos.equipamiento.id } }),
        null
      );
    });

    it('responde 404 si el id no existe', async () => {
      const respuesta = await request(app).delete('/api/equipamientos/999999').set(...admin);

      assert.equal(respuesta.status, 404);
    });
  });
});

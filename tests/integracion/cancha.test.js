const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../../src/app');
const { prisma, verificarBaseDePrueba, limpiar, sembrar, autorizacion } = require('../apoyo/base');

describe('Listado de canchas', () => {
  let datos;
  let admin;
  let cliente;
  let padel;
  let canchaDePadel;

  before(verificarBaseDePrueba);

  beforeEach(async () => {
    await limpiar();
    datos = await sembrar();
    admin = autorizacion(datos.admin);
    cliente = autorizacion(datos.cliente);

    padel = await prisma.tipoCancha.create({
      data: { nombre: 'Pádel', descripcion: 'Cancha con paredes' }
    });

    canchaDePadel = await prisma.cancha.create({
      data: {
        nombre: 'Cancha 3',
        precioPorHora: 9500.5,
        estado: 'DISPONIBLE',
        tipoCanchaId: padel.id
      }
    });
  });

  after(async () => {
    await limpiar();
    await prisma.$disconnect();
  });

  describe('GET /api/canchas', () => {
    it('devuelve todas las canchas cuando no se filtra', async () => {
      const respuesta = await request(app).get('/api/canchas').set(...admin);

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.length, 3);
    });

    it('las devuelve ordenadas por nombre', async () => {
      const respuesta = await request(app).get('/api/canchas').set(...admin);

      assert.deepEqual(
        respuesta.body.map((cancha) => cancha.nombre),
        ['Cancha 1', 'Cancha 2', 'Cancha 3']
      );
    });

    it('incluye el tipo de cada cancha', async () => {
      const respuesta = await request(app).get('/api/canchas').set(...admin);

      assert.equal(respuesta.body[0].tipoCancha.nombre, datos.tipoCancha.nombre);
    });

    it('devuelve el precio como número y no como texto', async () => {
      const respuesta = await request(app).get('/api/canchas').set(...admin);
      const cancha = respuesta.body.find((actual) => actual.id === canchaDePadel.id);

      assert.equal(cancha.precioPorHora, 9500.5);
    });

    it('deja leer el listado al cliente, que lo necesita para reservar', async () => {
      const respuesta = await request(app).get('/api/canchas').set(...cliente);

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.length, 3);
    });

    it('pide sesión', async () => {
      const respuesta = await request(app).get('/api/canchas');

      assert.equal(respuesta.status, 401);
    });
  });

  describe('GET /api/canchas?tipoCanchaId=', () => {
    it('devuelve solamente las canchas de ese tipo', async () => {
      const respuesta = await request(app)
        .get(`/api/canchas?tipoCanchaId=${padel.id}`)
        .set(...admin);

      assert.equal(respuesta.status, 200);
      assert.deepEqual(
        respuesta.body.map((cancha) => cancha.nombre),
        ['Cancha 3']
      );
    });

    it('devuelve las del otro tipo cuando se filtra por el otro tipo', async () => {
      const respuesta = await request(app)
        .get(`/api/canchas?tipoCanchaId=${datos.tipoCancha.id}`)
        .set(...admin);

      assert.deepEqual(
        respuesta.body.map((cancha) => cancha.nombre),
        ['Cancha 1', 'Cancha 2']
      );
    });

    it('filtra sin importar el estado de la cancha', async () => {
      const respuesta = await request(app)
        .get(`/api/canchas?tipoCanchaId=${datos.tipoCancha.id}`)
        .set(...admin);

      assert.ok(respuesta.body.some((cancha) => cancha.estado === 'MANTENIMIENTO'));
    });

    it('también filtra para el cliente', async () => {
      const respuesta = await request(app)
        .get(`/api/canchas?tipoCanchaId=${padel.id}`)
        .set(...cliente);

      assert.equal(respuesta.body.length, 1);
    });

    it('devuelve una lista vacía si el tipo no tiene canchas', async () => {
      const vacio = await prisma.tipoCancha.create({
        data: { nombre: 'Tenis', descripcion: 'Polvo de ladrillo' }
      });

      const respuesta = await request(app)
        .get(`/api/canchas?tipoCanchaId=${vacio.id}`)
        .set(...admin);

      assert.equal(respuesta.status, 200);
      assert.deepEqual(respuesta.body, []);
    });

    it('devuelve una lista vacía si el tipo ni siquiera existe', async () => {
      const respuesta = await request(app).get('/api/canchas?tipoCanchaId=99999').set(...admin);

      assert.equal(respuesta.status, 200);
      assert.deepEqual(respuesta.body, []);
    });

    it('rechaza un tipo que no es un número', async () => {
      const respuesta = await request(app).get('/api/canchas?tipoCanchaId=futbol').set(...admin);

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /tipo de cancha/);
    });

    it('rechaza el filtro vacío', async () => {
      const respuesta = await request(app).get('/api/canchas?tipoCanchaId=').set(...admin);

      assert.equal(respuesta.status, 400);
    });
  });
});

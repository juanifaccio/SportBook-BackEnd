const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../../src/app');
const { prisma, verificarBaseDePrueba, limpiar, sembrar, autorizacion } = require('../apoyo/base');

/**
 * El listado de canchas con su filtro por tipo.
 *
 * El alta, la edición y la baja las recorre `tipoCancha.test.js`, que es la
 * implementación de referencia del proyecto y hace el mismo camino; lo que se
 * prueba acá es lo propio de este listado —el filtro, el orden y el tipo que
 * viaja anidado— más los niveles de acceso, que en canchas están partidos:
 * leerlas lo puede hacer cualquiera que tenga sesión porque reservar arranca
 * eligiendo una, y administrarlas es del complejo.
 */
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

    // Lo sembrado tiene un solo tipo, así que un filtro no podría distinguir
    // nada: hace falta un segundo tipo con una cancha propia.
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

    // El listado las muestra por nombre, así que el orden lo tiene que dar la
    // base: ordenarlas en el navegador dejaría cada cliente con el suyo.
    it('las devuelve ordenadas por nombre', async () => {
      const respuesta = await request(app).get('/api/canchas').set(...admin);

      assert.deepEqual(
        respuesta.body.map((cancha) => cancha.nombre),
        ['Cancha 1', 'Cancha 2', 'Cancha 3']
      );
    });

    // Sin el tipo anidado el listado tendría que pedirlo cancha por cancha.
    it('incluye el tipo de cada cancha', async () => {
      const respuesta = await request(app).get('/api/canchas').set(...admin);

      assert.equal(respuesta.body[0].tipoCancha.nombre, datos.tipoCancha.nombre);
    });

    // Prisma devuelve el Decimal como string; el frontend lo necesita como
    // número para formatearlo y multiplicarlo.
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

    // Un tipo sin canchas no es un error: es una búsqueda sin resultados.
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

    // Sin valor la clave llega como cadena vacía, que no es un número: se
    // rechaza en vez de devolver el catálogo entero como si no hubiera filtro.
    it('rechaza el filtro vacío', async () => {
      const respuesta = await request(app).get('/api/canchas?tipoCanchaId=').set(...admin);

      assert.equal(respuesta.status, 400);
    });
  });
});

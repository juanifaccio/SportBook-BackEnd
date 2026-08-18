const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../../src/app');
const { prisma, verificarBaseDePrueba, limpiar, sembrar, autorizacion } = require('../apoyo/base');

/**
 * La matriz de permisos, recorrida endpoint por endpoint.
 *
 * Es el test que se rompe si alguien agrega un recurso y se olvida de declararle
 * los permisos en su archivo de rutas: sin sesión no se entra a ningún lado, y
 * administrar el complejo es cosa del administrador.
 */
describe('niveles de acceso', () => {
  let datos;

  before(verificarBaseDePrueba);

  beforeEach(async () => {
    await limpiar();
    datos = await sembrar();
  });

  after(async () => {
    await limpiar();
    await prisma.$disconnect();
  });

  describe('sin sesión', () => {
    // Recorre un endpoint de cada recurso: si mañana se monta uno nuevo sin
    // `autenticar`, este test no lo ve, pero deja escrito el criterio que se
    // espera de todos.
    const endpoints = [
      ['get', '/api/tipos-cancha'],
      ['get', '/api/tipos-evento'],
      ['get', '/api/canchas'],
      ['get', '/api/horarios'],
      ['get', '/api/roles'],
      ['get', '/api/usuarios'],
      ['get', '/api/reservas'],
      ['post', '/api/reservas']
    ];

    for (const [metodo, ruta] of endpoints) {
      it(`rechaza ${metodo.toUpperCase()} ${ruta}`, async () => {
        const respuesta = await request(app)[metodo](ruta).send({});

        assert.equal(respuesta.status, 401);
      });
    }

    it('deja pasar el login, que es la única puerta de entrada', async () => {
      const respuesta = await request(app).post('/api/auth/login').send({});

      assert.notEqual(respuesta.status, 401);
    });
  });

  describe('cliente', () => {
    // El cliente necesita el catálogo para poder reservar: sin ver las canchas y
    // sus turnos no podría elegir ninguno.
    it('consulta los tipos de cancha, las canchas y los horarios', async () => {
      for (const ruta of ['/api/tipos-cancha', '/api/tipos-evento', '/api/canchas', '/api/horarios']) {
        const respuesta = await request(app).get(ruta).set(...autorizacion(datos.cliente));

        assert.equal(respuesta.status, 200, `esperaba 200 en GET ${ruta}`);
      }
    });

    it('no puede administrar el catálogo', async () => {
      const alta = await request(app)
        .post('/api/tipos-cancha')
        .set(...autorizacion(datos.cliente))
        .send({ nombre: 'Pádel', descripcion: 'Con paredes' });

      const edicion = await request(app)
        .put(`/api/tipos-cancha/${datos.tipoCancha.id}`)
        .set(...autorizacion(datos.cliente))
        .send({ nombre: 'Otro', descripcion: 'Otra' });

      const baja = await request(app)
        .delete(`/api/tipos-cancha/${datos.tipoCancha.id}`)
        .set(...autorizacion(datos.cliente));

      assert.equal(alta.status, 403);
      assert.equal(edicion.status, 403);
      assert.equal(baja.status, 403);
    });

    it('no puede cargar canchas ni turnos', async () => {
      const cancha = await request(app)
        .post('/api/canchas')
        .set(...autorizacion(datos.cliente))
        .send({ nombre: 'Cancha 9', precioPorHora: 5000, estado: 'DISPONIBLE', tipoCanchaId: datos.tipoCancha.id });

      const horario = await request(app)
        .post('/api/horarios')
        .set(...autorizacion(datos.cliente))
        .send({ fecha: '2026-09-15', horaInicio: '10:00', horaFin: '11:00', canchaId: datos.cancha.id });

      assert.equal(cancha.status, 403);
      assert.equal(horario.status, 403);
    });

    // Usuarios y roles son administración pura: quién existe en el complejo y con
    // qué nivel de acceso no es asunto de un cliente.
    it('no llega a los usuarios ni a los roles', async () => {
      const usuarios = await request(app).get('/api/usuarios').set(...autorizacion(datos.cliente));
      const roles = await request(app).get('/api/roles').set(...autorizacion(datos.cliente));

      assert.equal(usuarios.status, 403);
      assert.equal(roles.status, 403);
    });

    it('no puede darse de alta a sí mismo ni cambiarse el rol', async () => {
      const respuesta = await request(app)
        .post('/api/usuarios')
        .set(...autorizacion(datos.cliente))
        .send({ nombre: 'Yo mismo', email: 'yo@test.local', contrasena: 'clave1234', telefono: '341 555-1111', rolId: 1 });

      assert.equal(respuesta.status, 403);
    });
  });

  describe('administrador', () => {
    it('administra el catálogo', async () => {
      const respuesta = await request(app)
        .post('/api/tipos-cancha')
        .set(...autorizacion(datos.admin))
        .send({ nombre: 'Pádel', descripcion: 'Con paredes' });

      assert.equal(respuesta.status, 201);
    });

    it('llega a los usuarios y a los roles', async () => {
      const usuarios = await request(app).get('/api/usuarios').set(...autorizacion(datos.admin));
      const roles = await request(app).get('/api/roles').set(...autorizacion(datos.admin));

      assert.equal(usuarios.status, 200);
      assert.equal(roles.status, 200);
    });

    it('no devuelve las contraseñas en el listado de usuarios', async () => {
      const respuesta = await request(app).get('/api/usuarios').set(...autorizacion(datos.admin));

      for (const usuario of respuesta.body) {
        assert.equal('contrasena' in usuario, false);
      }
    });
  });
});

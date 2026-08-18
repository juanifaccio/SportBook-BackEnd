const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const app = require('../../src/app');
const { jwt: configJwt } = require('../../src/config/env');
const ROLES = require('../../src/config/roles');
const { prisma, verificarBaseDePrueba, limpiar, sembrar, tokenDe, autorizacion, CONTRASENA } = require('../apoyo/base');

describe('autenticación', () => {
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

  describe('POST /api/auth/login', () => {
    // Es el único endpoint de toda la API al que se puede llegar sin token: si
    // pidiera sesión, no habría forma de conseguir la primera.
    it('no exige sesión', async () => {
      const respuesta = await request(app).post('/api/auth/login').send({});

      assert.notEqual(respuesta.status, 401);
    });

    it('devuelve el token y el usuario con las credenciales correctas', async () => {
      const respuesta = await request(app)
        .post('/api/auth/login')
        .send({ email: datos.cliente.email, contrasena: CONTRASENA });

      assert.equal(respuesta.status, 200);
      assert.equal(typeof respuesta.body.token, 'string');
      assert.equal(respuesta.body.usuario.id, datos.cliente.id);
      assert.equal(respuesta.body.usuario.rol.nombre, ROLES.CLIENTE);
    });

    it('nunca devuelve la contraseña', async () => {
      const respuesta = await request(app)
        .post('/api/auth/login')
        .send({ email: datos.cliente.email, contrasena: CONTRASENA });

      assert.equal('contrasena' in respuesta.body.usuario, false);
    });

    // El token es lo que el resto de la API va a exigir, así que tiene que servir
    // de verdad y llevar quién es el usuario.
    it('firma un token que identifica al usuario', async () => {
      const respuesta = await request(app)
        .post('/api/auth/login')
        .send({ email: datos.cliente.email, contrasena: CONTRASENA });

      const contenido = jwt.verify(respuesta.body.token, configJwt.secreto);

      assert.equal(contenido.id, datos.cliente.id);
      assert.equal(contenido.rol, ROLES.CLIENTE);
    });

    // El email se guarda en minúsculas: escribirlo con mayúsculas no tiene que
    // impedir entrar.
    it('acepta el email escrito con mayúsculas y espacios', async () => {
      const respuesta = await request(app)
        .post('/api/auth/login')
        .send({ email: `  ${datos.cliente.email.toUpperCase()}  `, contrasena: CONTRASENA });

      assert.equal(respuesta.status, 200);
    });

    it('pide el email y la contraseña', async () => {
      const sinNada = await request(app).post('/api/auth/login').send({});
      const sinContrasena = await request(app).post('/api/auth/login').send({ email: datos.cliente.email });

      assert.equal(sinNada.status, 400);
      assert.equal(sinContrasena.status, 400);
    });

    it('rechaza una contraseña incorrecta', async () => {
      const respuesta = await request(app)
        .post('/api/auth/login')
        .send({ email: datos.cliente.email, contrasena: 'la-que-no-es' });

      assert.equal(respuesta.status, 401);
    });

    it('rechaza un email que no existe', async () => {
      const respuesta = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nadie@test.local', contrasena: CONTRASENA });

      assert.equal(respuesta.status, 401);
    });

    // Distinguir los dos casos le confirmaría a quien prueba combinaciones qué
    // emails están registrados, que es la mitad del trabajo de entrar.
    it('responde lo mismo ante un email desconocido que ante una contraseña incorrecta', async () => {
      const emailDesconocido = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nadie@test.local', contrasena: CONTRASENA });

      const contrasenaMal = await request(app)
        .post('/api/auth/login')
        .send({ email: datos.cliente.email, contrasena: 'la-que-no-es' });

      assert.equal(emailDesconocido.body.mensaje, contrasenaMal.body.mensaje);
    });

    it('no deja entrar a una cuenta dada de baja', async () => {
      const respuesta = await request(app)
        .post('/api/auth/login')
        .send({ email: datos.inactivo.email, contrasena: CONTRASENA });

      assert.equal(respuesta.status, 403);
      assert.match(respuesta.body.mensaje, /baja/);
    });

    // El estado de la cuenta se informa recién con la contraseña ya validada:
    // antes, sería otra forma de averiguar qué emails están registrados.
    it('no revela que la cuenta existe si la contraseña es incorrecta', async () => {
      const respuesta = await request(app)
        .post('/api/auth/login')
        .send({ email: datos.inactivo.email, contrasena: 'la-que-no-es' });

      assert.equal(respuesta.status, 401);
    });
  });

  describe('GET /api/auth/yo', () => {
    it('devuelve el usuario de la sesión', async () => {
      const respuesta = await request(app).get('/api/auth/yo').set(...autorizacion(datos.cliente));

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.id, datos.cliente.id);
      assert.equal('contrasena' in respuesta.body, false);
    });

    it('rechaza el pedido sin token', async () => {
      assert.equal((await request(app).get('/api/auth/yo')).status, 401);
    });

    it('rechaza un token firmado con otro secreto', async () => {
      const ajeno = jwt.sign({ id: datos.cliente.id, rol: ROLES.CLIENTE }, 'otro-secreto-de-mas-de-32-caracteres');

      const respuesta = await request(app).get('/api/auth/yo').set('Authorization', `Bearer ${ajeno}`);

      assert.equal(respuesta.status, 401);
    });

    it('rechaza un token vencido', async () => {
      const vencido = jwt.sign({ id: datos.cliente.id, rol: ROLES.CLIENTE }, configJwt.secreto, {
        expiresIn: '-1s'
      });

      const respuesta = await request(app).get('/api/auth/yo').set('Authorization', `Bearer ${vencido}`);

      assert.equal(respuesta.status, 401);
    });
  });

  // El middleware relee el usuario de la base en cada request en vez de confiar
  // en lo que dice el token. Estos tres casos son los que justifican esa consulta
  // de más: con un token válido por horas, confiar en su contenido dejaría
  // entrar a quien ya no debería.
  describe('el token no manda: el usuario se relee de la base', () => {
    it('corta el acceso apenas se da de baja al usuario', async () => {
      const token = tokenDe(datos.cliente);

      await prisma.usuario.update({ where: { id: datos.cliente.id }, data: { activo: false } });

      const respuesta = await request(app).get('/api/auth/yo').set('Authorization', `Bearer ${token}`);

      // 401 y no 403: lo que dejó de valer es la sesión, no el permiso para este
      // endpoint. Es lo que le permite al frontend deslogear en vez de dejar al
      // usuario viendo un error en cada pantalla.
      assert.equal(respuesta.status, 401);
      assert.match(respuesta.body.mensaje, /baja/);
    });

    it('corta el acceso si la cuenta ya no existe', async () => {
      const token = tokenDe(datos.otroCliente);

      await prisma.usuario.delete({ where: { id: datos.otroCliente.id } });

      const respuesta = await request(app).get('/api/auth/yo').set('Authorization', `Bearer ${token}`);

      assert.equal(respuesta.status, 401);
    });

    it('usa el rol de la base y no el que viaja en el token', async () => {
      // Token emitido cuando todavía era cliente.
      const token = tokenDe(datos.cliente);

      const rolAdmin = await prisma.rol.findUnique({ where: { nombre: ROLES.ADMIN } });
      await prisma.usuario.update({ where: { id: datos.cliente.id }, data: { rolId: rolAdmin.id } });

      const respuesta = await request(app).get('/api/auth/yo').set('Authorization', `Bearer ${token}`);

      assert.equal(respuesta.body.rol.nombre, ROLES.ADMIN);
    });

    // El caso inverso, que es el que importa para la seguridad: un token que
    // dice ADMIN no alcanza para administrar nada.
    it('no deja administrar con un token que se declara admin', async () => {
      const mentiroso = jwt.sign({ id: datos.cliente.id, rol: ROLES.ADMIN }, configJwt.secreto);

      const respuesta = await request(app).get('/api/usuarios').set('Authorization', `Bearer ${mentiroso}`);

      assert.equal(respuesta.status, 403);
    });
  });
});

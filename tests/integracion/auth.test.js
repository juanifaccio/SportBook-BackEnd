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

  // El perfil propio va sobre el usuario de la sesión y no sobre un `:id`: acá
  // se comprueba que sea de verdad el suyo y, sobre todo, que la lista blanca de
  // campos aguante lo que le manden.
  describe('PUT /api/auth/yo', () => {
    const perfil = (cambios = {}) => ({
      nombre: 'Nombre Corregido',
      email: 'corregido@test.local',
      telefono: '341 555-1111',
      ...cambios
    });

    const actualizar = (usuario, cuerpo) =>
      request(app)
        .put('/api/auth/yo')
        .set(...autorizacion(usuario))
        .send(cuerpo);

    it('actualiza los datos del usuario de la sesión', async () => {
      const respuesta = await actualizar(datos.cliente, perfil());

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.id, datos.cliente.id);
      assert.equal(respuesta.body.nombre, 'Nombre Corregido');
      assert.equal(respuesta.body.telefono, '341 555-1111');
    });

    it('lo deja realmente guardado', async () => {
      await actualizar(datos.cliente, perfil());

      const guardado = await prisma.usuario.findUnique({ where: { id: datos.cliente.id } });

      assert.equal(guardado.nombre, 'Nombre Corregido');
      assert.equal(guardado.email, 'corregido@test.local');
    });

    it('nunca devuelve la contraseña', async () => {
      const respuesta = await actualizar(datos.cliente, perfil());

      assert.equal('contrasena' in respuesta.body, false);
    });

    // El corazón de la tarea: sin esto un cliente se asciende con un PUT a sus
    // propios datos.
    it('ignora el rol que venga en el cuerpo', async () => {
      const rolAdmin = await prisma.rol.findUnique({ where: { nombre: ROLES.ADMIN } });

      const respuesta = await actualizar(datos.cliente, perfil({ rolId: rolAdmin.id }));

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.rol.nombre, ROLES.CLIENTE);

      const guardado = await prisma.usuario.findUnique({ where: { id: datos.cliente.id } });
      assert.equal(guardado.rolId, datos.cliente.rolId);
    });

    it('ignora el activo que venga en el cuerpo', async () => {
      await prisma.usuario.update({ where: { id: datos.cliente.id }, data: { activo: true } });

      await actualizar(datos.cliente, perfil({ activo: false }));

      const guardado = await prisma.usuario.findUnique({ where: { id: datos.cliente.id } });

      assert.equal(guardado.activo, true);
    });

    // La contraseña tiene su propio endpoint, que además pide la actual: si se
    // colara por acá, alcanzaría un token prestado para cambiarla.
    it('ignora la contraseña que venga en el cuerpo', async () => {
      const antes = await prisma.usuario.findUnique({ where: { id: datos.cliente.id } });

      await actualizar(datos.cliente, perfil({ contrasena: 'otraClave123' }));

      const despues = await prisma.usuario.findUnique({ where: { id: datos.cliente.id } });

      assert.equal(despues.contrasena, antes.contrasena);
    });

    it('rechaza un email con formato inválido', async () => {
      const respuesta = await actualizar(datos.cliente, perfil({ email: 'sin-arroba' }));

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /email/);
    });

    it('no deja pisar el email de otro usuario', async () => {
      const respuesta = await actualizar(datos.cliente, perfil({ email: datos.otroCliente.email }));

      assert.equal(respuesta.status, 409);
      assert.match(respuesta.body.mensaje, /ese email/);
    });

    // No hace falta ser administrador: cualquiera con sesión gestiona su propia
    // cuenta.
    it('también le sirve al administrador', async () => {
      const respuesta = await actualizar(datos.admin, perfil({ email: 'jefa@test.local' }));

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.id, datos.admin.id);
    });

    it('rechaza el pedido sin token', async () => {
      assert.equal((await request(app).put('/api/auth/yo').send(perfil())).status, 401);
    });
  });

  describe('PUT /api/auth/yo/contrasena', () => {
    const cambiar = (usuario, cuerpo) =>
      request(app)
        .put('/api/auth/yo/contrasena')
        .set(...autorizacion(usuario))
        .send(cuerpo);

    const NUEVA = 'claveNueva456';

    it('cambia la contraseña y deja entrar con la nueva', async () => {
      const respuesta = await cambiar(datos.cliente, {
        contrasenaActual: CONTRASENA,
        contrasenaNueva: NUEVA
      });

      assert.equal(respuesta.status, 200);

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: datos.cliente.email, contrasena: NUEVA });

      assert.equal(login.status, 200);
    });

    it('la anterior deja de servir', async () => {
      await cambiar(datos.cliente, { contrasenaActual: CONTRASENA, contrasenaNueva: NUEVA });

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: datos.cliente.email, contrasena: CONTRASENA });

      assert.equal(login.status, 401);
    });

    it('la guarda hasheada, nunca en claro', async () => {
      await cambiar(datos.cliente, { contrasenaActual: CONTRASENA, contrasenaNueva: NUEVA });

      const guardado = await prisma.usuario.findUnique({ where: { id: datos.cliente.id } });

      assert.notEqual(guardado.contrasena, NUEVA);
      assert.match(guardado.contrasena, /^\$2[aby]\$/);
    });

    // 400 y no 401: la sesión sirve, lo que está mal es un dato del formulario.
    // Con un 401 el frontend cerraría la sesión por un error de tipeo.
    it('rechaza con 400 una contraseña actual incorrecta, y no cambia nada', async () => {
      const respuesta = await cambiar(datos.cliente, {
        contrasenaActual: 'no-es-esta',
        contrasenaNueva: NUEVA
      });

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /actual no es correcta/);

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: datos.cliente.email, contrasena: CONTRASENA });

      assert.equal(login.status, 200);
    });

    it('rechaza una contraseña nueva corta', async () => {
      const respuesta = await cambiar(datos.cliente, {
        contrasenaActual: CONTRASENA,
        contrasenaNueva: 'corta'
      });

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /8 caracteres/);
    });

    it('rechaza el pedido sin token', async () => {
      const respuesta = await request(app)
        .put('/api/auth/yo/contrasena')
        .send({ contrasenaActual: CONTRASENA, contrasenaNueva: NUEVA });

      assert.equal(respuesta.status, 401);
    });

    // El token sigue valiendo: quien se cambia la clave no tiene por qué quedar
    // deslogueado.
    it('la sesión en curso sigue funcionando', async () => {
      const cabecera = autorizacion(datos.cliente);

      await request(app)
        .put('/api/auth/yo/contrasena')
        .set(...cabecera)
        .send({ contrasenaActual: CONTRASENA, contrasenaNueva: NUEVA });

      const respuesta = await request(app).get('/api/auth/yo').set(...cabecera);

      assert.equal(respuesta.status, 200);
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

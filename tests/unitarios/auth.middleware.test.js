const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { autenticar, autorizar } = require('../../src/middlewares/auth.middleware');
const { jwt: configJwt } = require('../../src/config/env');
const ROLES = require('../../src/config/roles');
const { crearReq, crearRes, crearNext } = require('../apoyo/dobles');

const conToken = (token) => crearReq({ headers: { authorization: `Bearer ${token}` } });

const usuarioConRol = (nombre) => ({ id: 1, nombre: 'Alguien', rol: { id: 1, nombre } });

describe('middlewares/auth', () => {
  // Los casos que sí llegan a consultar la base —usuario borrado, dado de baja,
  // cambio de rol— se cubren en `tests/integracion/auth.test.js`, donde hay una
  // base de verdad contra la que releerlo. Acá quedan los que se resuelven antes
  // de tocarla, que son los que deciden si el request sigue o no.
  describe('autenticar', () => {
    it('rechaza el request sin cabecera Authorization', async () => {
      const res = crearRes();
      const next = crearNext();

      await autenticar(crearReq(), res, next);

      assert.equal(res.codigo, 401);
      assert.match(res.cuerpo.mensaje, /iniciar sesión/);
      assert.equal(next.llamado, false);
    });

    it('rechaza una cabecera que no use el esquema Bearer', async () => {
      const res = crearRes();
      const next = crearNext();

      await autenticar(crearReq({ headers: { authorization: 'Token abc123' } }), res, next);

      assert.equal(res.codigo, 401);
      assert.equal(next.llamado, false);
    });

    it('rechaza un token que no se puede verificar', async () => {
      const res = crearRes();
      const next = crearNext();

      await autenticar(conToken('esto-no-es-un-token'), res, next);

      assert.equal(res.codigo, 401);
      assert.match(res.cuerpo.mensaje, /Iniciá sesión de nuevo/);
      assert.equal(next.llamado, false);
    });

    // El caso que justifica firmar con un secreto: un token con la forma correcta
    // pero firmado por otro no vale nada.
    it('rechaza un token firmado con otro secreto', async () => {
      const ajeno = jwt.sign({ id: 1, rol: ROLES.ADMIN }, 'otro-secreto-de-mas-de-32-caracteres');
      const res = crearRes();
      const next = crearNext();

      await autenticar(conToken(ajeno), res, next);

      assert.equal(res.codigo, 401);
      assert.equal(next.llamado, false);
    });

    it('rechaza un token vencido', async () => {
      const vencido = jwt.sign({ id: 1, rol: ROLES.ADMIN }, configJwt.secreto, { expiresIn: '-1s' });
      const res = crearRes();
      const next = crearNext();

      await autenticar(conToken(vencido), res, next);

      assert.equal(res.codigo, 401);
      assert.match(res.cuerpo.mensaje, /expiró|válido/);
      assert.equal(next.llamado, false);
    });

    // Mismo mensaje para el token vencido y para el adulterado: distinguirlos solo
    // le diría a quien lo fabricó qué le falló.
    it('no distingue el token vencido del inválido', async () => {
      const vencido = jwt.sign({ id: 1 }, configJwt.secreto, { expiresIn: '-1s' });
      const inventado = 'a.b.c';

      const resVencido = crearRes();
      const resInventado = crearRes();

      await autenticar(conToken(vencido), resVencido, crearNext());
      await autenticar(conToken(inventado), resInventado, crearNext());

      assert.equal(resVencido.cuerpo.mensaje, resInventado.cuerpo.mensaje);
    });
  });

  describe('autorizar', () => {
    it('deja pasar al rol permitido', () => {
      const req = crearReq({ usuario: usuarioConRol(ROLES.ADMIN) });
      const res = crearRes();
      const next = crearNext();

      autorizar(ROLES.ADMIN)(req, res, next);

      assert.equal(next.llamado, true);
      assert.equal(res.respondio, false);
    });

    it('corta al rol que no está en la lista', () => {
      const req = crearReq({ usuario: usuarioConRol(ROLES.CLIENTE) });
      const res = crearRes();
      const next = crearNext();

      autorizar(ROLES.ADMIN)(req, res, next);

      assert.equal(res.codigo, 403);
      assert.match(res.cuerpo.mensaje, /permisos/);
      assert.equal(next.llamado, false);
    });

    it('acepta cualquiera de los roles indicados', () => {
      const next = crearNext();

      autorizar(ROLES.ADMIN, ROLES.CLIENTE)(crearReq({ usuario: usuarioConRol(ROLES.CLIENTE) }), crearRes(), next);

      assert.equal(next.llamado, true);
    });

    // Es 401 y no 403 porque sin usuario en el request no hay sesión que evaluar:
    // el problema es que no inició sesión, no que le falte un permiso.
    it('responde 401 si no hay usuario en el request', () => {
      const res = crearRes();
      const next = crearNext();

      autorizar(ROLES.ADMIN)(crearReq(), res, next);

      assert.equal(res.codigo, 401);
      assert.equal(next.llamado, false);
    });
  });
});

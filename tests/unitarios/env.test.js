const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const RUTA = require.resolve('../../src/config/env');

const AMBIENTE_VALIDO = {
  DATABASE_URL: 'mysql://sportbook:secreto@localhost:3306/sportsbook_test',
  JWT_SECRET: 'un-secreto-de-exactamente-32-cars',
  PORT: '',
  JWT_EXPIRACION: '',
  ADMIN_EMAIL: '',
  ADMIN_CONTRASENA: ''
};

const original = { ...process.env };

const cargar = (cambios = {}) => {
  for (const [clave, valor] of Object.entries({ ...AMBIENTE_VALIDO, ...cambios })) {
    process.env[clave] = valor;
  }

  delete require.cache[RUTA];

  return require(RUTA);
};

afterEach(() => {
  for (const clave of Object.keys(process.env)) {
    if (!(clave in original)) {
      delete process.env[clave];
    }
  }

  Object.assign(process.env, original);

  delete require.cache[RUTA];
});

describe('config/env', () => {
  describe('PORT', () => {
    it('usa el 3000 cuando no está definido', () => {
      assert.equal(cargar().puerto, 3000);
    });

    it('toma el puerto configurado', () => {
      assert.equal(cargar({ PORT: '4000' }).puerto, 4000);
    });

    it('rechaza un puerto que no es un número', () => {
      assert.throws(() => cargar({ PORT: 'tres mil' }), /PORT/);
    });

    it('rechaza un puerto fuera del rango válido', () => {
      assert.throws(() => cargar({ PORT: '70000' }), /PORT/);
    });
  });

  describe('DATABASE_URL', () => {
    it('desarma la URL en los datos de conexión', () => {
      const { baseDeDatos } = cargar({
        DATABASE_URL: 'mysql://root:clave@127.0.0.1:3307/sportsbook_test'
      });

      assert.deepEqual(baseDeDatos, {
        host: '127.0.0.1',
        puerto: 3307,
        usuario: 'root',
        contrasena: 'clave',
        base: 'sportsbook_test'
      });
    });

    it('usa el 3306 cuando la URL no trae puerto', () => {
      const { baseDeDatos } = cargar({
        DATABASE_URL: 'mysql://root:clave@localhost/sportsbook_test'
      });

      assert.equal(baseDeDatos.puerto, 3306);
    });

    it('decodifica el usuario y la contraseña', () => {
      const { baseDeDatos } = cargar({
        DATABASE_URL: 'mysql://mi%20usuario:cla%40ve%231@localhost:3306/sportsbook_test'
      });

      assert.equal(baseDeDatos.usuario, 'mi usuario');
      assert.equal(baseDeDatos.contrasena, 'cla@ve#1');
    });

    it('falla si no está definida', () => {
      assert.throws(() => cargar({ DATABASE_URL: '' }), /DATABASE_URL/);
    });

    it('falla si no es una URL', () => {
      assert.throws(() => cargar({ DATABASE_URL: 'sportsbook_test' }), /URL válida/);
    });

    it('falla si le falta el esquema mysql://', () => {
      assert.throws(() => cargar({ DATABASE_URL: 'localhost:3306/sportsbook_test' }), /mysql:\/\//);
    });

    it('falla si no indica el nombre de la base', () => {
      assert.throws(() => cargar({ DATABASE_URL: 'mysql://root:clave@localhost:3306/' }), /base de datos/);
    });
  });

  describe('JWT_SECRET', () => {
    it('falla si no está definido', () => {
      assert.throws(() => cargar({ JWT_SECRET: '' }), /JWT_SECRET/);
    });

    it('falla si es más corto que 32 caracteres', () => {
      assert.throws(() => cargar({ JWT_SECRET: 'a'.repeat(31) }), /32 caracteres/);
    });

    it('acepta uno de 32 caracteres', () => {
      assert.equal(cargar({ JWT_SECRET: 'b'.repeat(32) }).jwt.secreto, 'b'.repeat(32));
    });
  });

  describe('JWT_EXPIRACION', () => {
    it('vale 8h cuando no está definida', () => {
      assert.equal(cargar().jwt.expiracion, '8h');
    });

    it('toma la configurada', () => {
      assert.equal(cargar({ JWT_EXPIRACION: '30m' }).jwt.expiracion, '30m');
    });
  });

  describe('leerAdminInicial', () => {
    it('normaliza el email igual que el resto de la aplicación', () => {
      const { leerAdminInicial } = cargar({
        ADMIN_EMAIL: '  Admin@SportBook.COM  ',
        ADMIN_CONTRASENA: 'secreta1234'
      });

      assert.deepEqual(leerAdminInicial(), {
        email: 'admin@sportbook.com',
        contrasena: 'secreta1234'
      });
    });

    it('falla si faltan las credenciales', () => {
      const { leerAdminInicial } = cargar({ ADMIN_EMAIL: '', ADMIN_CONTRASENA: '' });

      assert.throws(leerAdminInicial, /ADMIN_EMAIL/);
    });

    it('no impide cargar la configuración cuando faltan', () => {
      assert.doesNotThrow(() => cargar({ ADMIN_EMAIL: '', ADMIN_CONTRASENA: '' }));
    });
  });
});

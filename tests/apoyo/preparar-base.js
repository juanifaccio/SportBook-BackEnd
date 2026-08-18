// Deja la base de pruebas lista para correr los tests de integración: la crea si
// no existe y le aplica las migraciones. Se corre con `npm run test:preparar`,
// una vez al principio y después de cada migración nueva.
//
// Es un script aparte y no algo que hagan los tests al arrancar porque crear una
// base y migrarla tarda, y no tiene por qué repetirse en cada corrida.

const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const mariadb = require('mariadb');

const RAIZ = path.resolve(__dirname, '../..');
const ARCHIVO = path.join(RAIZ, '.env.test');

if (!fs.existsSync(ARCHIVO)) {
  console.error('Falta el archivo .env.test. Copiá .env.test.example a .env.test y completalo (ver README).');
  process.exit(1);
}

// Se carga con `override` para que le gane al `.env` de desarrollo, y antes de
// requerir la configuración de la aplicación, que es la que valida la URL.
require('dotenv').config({ path: ARCHIVO, override: true, quiet: true });

const { baseDeDatos } = require('../../src/config/env');

if (!baseDeDatos.base.endsWith('_test')) {
  console.error(
    `La base configurada es "${baseDeDatos.base}", que no termina en "_test". ` +
      'Los tests de integración borran todas las tablas: revisá el DATABASE_URL de tu .env.test.'
  );
  process.exit(1);
}

const crearBase = async () => {
  // La conexión se abre sin nombre de base: es justamente la que todavía no
  // existe. El nombre no se puede pasar como parámetro en un CREATE DATABASE,
  // así que se interpola entre acentos graves; sale del `.env.test` del propio
  // desarrollador y ya se comprobó que termina en "_test".
  const conexion = await mariadb.createConnection({
    host: baseDeDatos.host,
    port: baseDeDatos.puerto,
    user: baseDeDatos.usuario,
    password: baseDeDatos.contrasena,
    allowPublicKeyRetrieval: true
  });

  try {
    await conexion.query(`CREATE DATABASE IF NOT EXISTS \`${baseDeDatos.base}\``);
    console.log(`Base de pruebas lista: ${baseDeDatos.base}`);
  } finally {
    await conexion.end();
  }
};

const migrar = () => {
  // `migrate deploy` y no `migrate dev`: acá no se crean migraciones nuevas, solo
  // se aplican las que ya están versionadas. Tampoco corre el seed, y está bien:
  // los usuarios de los tests los siembra cada suite.
  // Se invoca el CLI de Prisma por su archivo y con el mismo Node que corre este
  // script, en vez de pasar por `npx` con `shell: true`: así los argumentos no se
  // concatenan en una línea de comandos y anda igual en Windows que en Linux.
  const cli = require.resolve('prisma/build/index.js');

  const resultado = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], {
    cwd: RAIZ,
    stdio: 'inherit',
    env: process.env
  });

  if (resultado.status !== 0) {
    process.exit(resultado.status ?? 1);
  }
};

crearBase()
  .then(migrar)
  .catch((error) => {
    console.error('No se pudo preparar la base de pruebas:', error.message);
    process.exit(1);
  });

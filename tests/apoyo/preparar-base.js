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

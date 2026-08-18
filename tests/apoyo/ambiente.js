// Prepara el ambiente antes de que se cargue nada del código de la aplicación.
// Se engancha con `--require` desde los scripts de `package.json`, así corre
// antes que cualquier `require('../src/...')` de los tests.

const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '../..');
const ARCHIVO_DE_PRUEBA = path.join(RAIZ, '.env.test');

// `.env.test` tiene que ganarle al `.env` de desarrollo, y el orden lo permite:
// `src/config/env.js` carga el `.env` con dotenv, que nunca pisa una variable
// que ya esté en el ambiente. Con esto los tests de integración corren contra su
// propia base y no contra la del día a día.
if (fs.existsSync(ARCHIVO_DE_PRUEBA)) {
  require('dotenv').config({ path: ARCHIVO_DE_PRUEBA, override: true, quiet: true });
}

// Relleno para que los tests unitarios corran en una máquina recién clonada, sin
// ningún `.env`: no consultan la base ni validan tokens reales, pero
// `src/config/env.js` valida su configuración al importarse y sin estas dos
// variables no se lo podría ni requerir.
//
// No sirven para los tests de integración: esos necesitan una base de verdad, y
// `tests/apoyo/base.js` se encarga de comprobar que apunten a la correcta.
process.env.DATABASE_URL ||= 'mysql://sportbook:sportbook@localhost:3306/sportsbook_test';
process.env.JWT_SECRET ||= 'secreto-de-prueba-de-al-menos-32-caracteres';

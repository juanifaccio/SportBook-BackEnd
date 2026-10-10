const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '../..');
const ARCHIVO_DE_PRUEBA = path.join(RAIZ, '.env.test');

if (fs.existsSync(ARCHIVO_DE_PRUEBA)) {
  require('dotenv').config({ path: ARCHIVO_DE_PRUEBA, override: true, quiet: true });
}

process.env.DATABASE_URL ||= 'mysql://sportbook:sportbook@localhost:3306/sportsbook_test';
process.env.JWT_SECRET ||= 'secreto-de-prueba-de-al-menos-32-caracteres';

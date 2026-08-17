const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const { baseDeDatos } = require('./env');

const adapter = new PrismaMariaDb({
  host: baseDeDatos.host,
  user: baseDeDatos.usuario,
  password: baseDeDatos.contrasena,
  database: baseDeDatos.base,
  port: baseDeDatos.puerto,
  // MySQL 8 autentica con caching_sha2_password: cuando su caché está vacío
  // (por ejemplo tras reiniciar el servicio) exige intercambiar una clave RSA,
  // que el conector solo pide si se lo habilita explícitamente.
  allowPublicKeyRetrieval: true
});

const prisma = new PrismaClient({ adapter });

module.exports = prisma;

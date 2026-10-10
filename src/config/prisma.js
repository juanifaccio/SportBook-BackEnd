const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const { baseDeDatos } = require('./env');

const adapter = new PrismaMariaDb({
  host: baseDeDatos.host,
  user: baseDeDatos.usuario,
  password: baseDeDatos.contrasena,
  database: baseDeDatos.base,
  port: baseDeDatos.puerto,
  allowPublicKeyRetrieval: true
});

const prisma = new PrismaClient({ adapter });

module.exports = prisma;

const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');

const adapter = new PrismaMariaDb({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'sportsbook',
    port: 3306,
    // MySQL 8 autentica con caching_sha2_password: cuando su caché está vacío
    // (por ejemplo tras reiniciar el servicio) exige intercambiar una clave RSA,
    // que el conector solo pide si se lo habilita explícitamente.
    allowPublicKeyRetrieval: true
});

const prisma = new PrismaClient({ adapter });

module.exports = prisma;
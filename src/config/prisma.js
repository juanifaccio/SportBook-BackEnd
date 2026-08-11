const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');

const adapter = new PrismaMariaDb({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'sportsbook',
    port: 3306
});

const prisma = new PrismaClient({ adapter });

module.exports = prisma;
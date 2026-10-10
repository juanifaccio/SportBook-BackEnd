const bcrypt = require('bcryptjs');

const prisma = require('../src/config/prisma');
const { leerAdminInicial } = require('../src/config/env');
const ROLES = require('../src/config/roles');

const sembrarAdmin = async () => {
  const { email, contrasena } = leerAdminInicial();

  const rol = await prisma.rol.findUnique({
    where: {
      nombre: ROLES.ADMIN
    }
  });

  if (!rol) {
    throw new Error(
      `No existe el rol ${ROLES.ADMIN}. Corré las migraciones con "npm run prisma:migrate" antes del seed.`
    );
  }

  const existente = await prisma.usuario.findUnique({
    where: {
      email: email
    }
  });

  if (existente) {
    console.log(`El usuario ${email} ya existe: no se modifica.`);

    return;
  }

  await prisma.usuario.create({
    data: {
      nombre: 'Administrador',
      email: email,
      contrasena: await bcrypt.hash(contrasena, 10),
      telefono: '000-0000000',
      activo: true,
      rolId: rol.id
    }
  });

  console.log(`Administrador inicial creado: ${email}`);
};

sembrarAdmin()
  .catch((error) => {
    console.error(error.message);

    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

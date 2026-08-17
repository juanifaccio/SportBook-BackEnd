const bcrypt = require('bcryptjs');

const prisma = require('../src/config/prisma');
const { leerAdminInicial } = require('../src/config/env');
const ROLES = require('../src/config/roles');

/**
 * Crea el administrador inicial.
 *
 * Con el login puesto, la API no se puede usar sin una cuenta, y las cuentas las
 * da de alta un administrador: una base recién migrada no tendría por dónde
 * entrar. Esto lo resuelve sin dejar credenciales en el repositorio —salen del
 * `.env`, como la conexión a la base— ni en una migración, que quedaría
 * versionada con el hash adentro.
 *
 * Es idempotente y no pisa nada: si el email ya está registrado no lo toca. Un
 * seed que reescribe la contraseña de una cuenta existente cada vez que se lo
 * corre es una forma de perder la que estaba en uso.
 */
const sembrarAdmin = async () => {
  const { email, contrasena } = leerAdminInicial();

  const rol = await prisma.rol.findUnique({
    where: {
      nombre: ROLES.ADMIN
    }
  });

  // El catálogo de roles lo siembra la migración que crea la tabla, así que si
  // falta es que las migraciones no se corrieron.
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

    // Sin código de salida distinto de cero, un seed fallido dentro de
    // `prisma migrate reset` pasaría desapercibido.
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

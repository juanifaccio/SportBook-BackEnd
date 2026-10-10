const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = require('../../src/config/prisma');
const { baseDeDatos, jwt: configJwt } = require('../../src/config/env');
const ROLES = require('../../src/config/roles');
const { diaRelativo } = require('./fechas');

const SUFIJO_DE_PRUEBA = '_test';

const verificarBaseDePrueba = () => {
  const archivo = path.resolve(__dirname, '../../.env.test');

  if (!fs.existsSync(archivo)) {
    throw new Error(
      'Falta el archivo .env.test. Copiá .env.test.example a .env.test y completalo, ' +
        'después corré "npm run test:preparar" (ver README).'
    );
  }

  if (!baseDeDatos.base.endsWith(SUFIJO_DE_PRUEBA)) {
    throw new Error(
      `Los tests de integración borran todas las tablas y la base configurada es "${baseDeDatos.base}", ` +
        `que no termina en "${SUFIJO_DE_PRUEBA}". Revisá el DATABASE_URL de tu .env.test.`
    );
  }
};

const CONTRASENA = 'prueba1234';

let hashCacheado;

const hashDeLaContrasena = async () => {
  hashCacheado ??= await bcrypt.hash(CONTRASENA, 10);

  return hashCacheado;
};

const MANANA = diaRelativo(1);
const AYER = diaRelativo(-1);

const limpiar = async () => {
  await prisma.reservaEquipamiento.deleteMany();
  await prisma.pago.deleteMany();
  await prisma.evento.deleteMany();
  await prisma.reserva.deleteMany();
  await prisma.horario.deleteMany();
  await prisma.cancha.deleteMany();
  await prisma.tipoCancha.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.tipoEvento.deleteMany();
  await prisma.equipamiento.deleteMany();
};

const crearUsuario = async (datos) => {
  const rol = await prisma.rol.findUnique({ where: { nombre: datos.rol } });

  return prisma.usuario.create({
    data: {
      nombre: datos.nombre,
      email: datos.email,
      contrasena: await hashDeLaContrasena(),
      telefono: '341 555-0000',
      activo: datos.activo ?? true,
      rolId: rol.id
    },
    include: { rol: true }
  });
};

const sembrar = async () => {
  const admin = await crearUsuario({ nombre: 'Admin de prueba', email: 'admin@test.local', rol: ROLES.ADMIN });
  const cliente = await crearUsuario({ nombre: 'Cliente de prueba', email: 'cliente@test.local', rol: ROLES.CLIENTE });
  const otroCliente = await crearUsuario({ nombre: 'Otro cliente', email: 'otro@test.local', rol: ROLES.CLIENTE });
  const inactivo = await crearUsuario({
    nombre: 'Cliente dado de baja',
    email: 'inactivo@test.local',
    rol: ROLES.CLIENTE,
    activo: false
  });

  const tipoCancha = await prisma.tipoCancha.create({
    data: { nombre: 'Fútbol 5', descripcion: 'Césped sintético' }
  });

  const tipoEvento = await prisma.tipoEvento.create({ data: { nombre: 'Cumpleaños' } });

  const equipamiento = await prisma.equipamiento.create({
    data: { nombre: 'Pelota de fútbol', descripcion: 'Número 5', precio: 1500, stock: 10 }
  });

  const cancha = await prisma.cancha.create({
    data: {
      nombre: 'Cancha 1',
      precioPorHora: 12000,
      estado: 'DISPONIBLE',
      tipoCanchaId: tipoCancha.id
    }
  });

  const canchaEnMantenimiento = await prisma.cancha.create({
    data: {
      nombre: 'Cancha 2',
      precioPorHora: 8000,
      estado: 'MANTENIMIENTO',
      tipoCanchaId: tipoCancha.id
    }
  });

  const crearHorario = (datos) =>
    prisma.horario.create({
      data: {
        fecha: new Date(datos.fecha),
        horaInicio: datos.horaInicio,
        horaFin: datos.horaFin,
        canchaId: datos.canchaId
      }
    });

  const turnoLibre = await crearHorario({
    fecha: MANANA,
    horaInicio: '10:00',
    horaFin: '11:00',
    canchaId: cancha.id
  });

  const otroTurnoLibre = await crearHorario({
    fecha: MANANA,
    horaInicio: '11:00',
    horaFin: '12:30',
    canchaId: cancha.id
  });

  const turnoPasado = await crearHorario({
    fecha: AYER,
    horaInicio: '10:00',
    horaFin: '11:00',
    canchaId: cancha.id
  });

  const turnoEnMantenimiento = await crearHorario({
    fecha: MANANA,
    horaInicio: '10:00',
    horaFin: '11:00',
    canchaId: canchaEnMantenimiento.id
  });

  return {
    admin,
    cliente,
    otroCliente,
    inactivo,
    tipoCancha,
    tipoEvento,
    equipamiento,
    cancha,
    canchaEnMantenimiento,
    turnoLibre,
    otroTurnoLibre,
    turnoPasado,
    turnoEnMantenimiento
  };
};

const tokenDe = (usuario) =>
  jwt.sign({ id: usuario.id, rol: usuario.rol.nombre }, configJwt.secreto, {
    expiresIn: configJwt.expiracion
  });

const autorizacion = (usuario) => ['Authorization', `Bearer ${tokenDe(usuario)}`];

module.exports = {
  prisma,
  verificarBaseDePrueba,
  limpiar,
  sembrar,
  tokenDe,
  autorizacion,
  CONTRASENA
};

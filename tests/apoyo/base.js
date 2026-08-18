// Apoyo para los tests de integración: comprueba contra qué base están apuntando,
// la deja vacía antes de cada suite y siembra los datos con los que trabajan.

const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = require('../../src/config/prisma');
const { baseDeDatos, jwt: configJwt } = require('../../src/config/env');
const ROLES = require('../../src/config/roles');
const { diaRelativo } = require('./fechas');

/**
 * Los tests de integración borran todas las tablas, así que antes de tocar nada
 * se comprueba contra qué base están apuntando. Sin esta guarda, un `.env.test`
 * mal armado —o directamente ausente— vaciaría la base de desarrollo.
 *
 * El criterio es el nombre: una base de pruebas termina en `_test`.
 */
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

/** Contraseña en claro de todos los usuarios sembrados. */
const CONTRASENA = 'prueba1234';

/**
 * El hash de bcrypt es lento a propósito, así que se calcula una sola vez por
 * proceso y se reparte entre todos los usuarios sembrados. Con diez rondas por
 * usuario y por suite, preparar los datos tardaría más que los tests.
 */
let hashCacheado;

const hashDeLaContrasena = async () => {
  hashCacheado ??= await bcrypt.hash(CONTRASENA, 10);

  return hashCacheado;
};

const MANANA = diaRelativo(1);
const AYER = diaRelativo(-1);

/**
 * Vacía las tablas en orden de dependencia: primero las que apuntan a otras.
 * `Rol` queda intacto porque no lo cargan los tests sino la migración que lo
 * siembra, y borrarlo dejaría a los usuarios sin nivel de acceso.
 */
const limpiar = async () => {
  await prisma.pago.deleteMany();
  await prisma.evento.deleteMany();
  await prisma.reserva.deleteMany();
  await prisma.horario.deleteMany();
  await prisma.cancha.deleteMany();
  await prisma.tipoCancha.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.tipoEvento.deleteMany();
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

/**
 * Deja la base con un complejo mínimo pero completo: los cuatro usuarios que
 * hacen falta para probar los permisos, una cancha que admite reservas y otra en
 * mantenimiento, y turnos libres tanto a futuro como en el pasado.
 *
 * Devuelve todo lo creado para que cada test tome lo que necesita por nombre en
 * vez de arrastrar ids sueltos.
 */
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

  // Una hora justa, para que el precio del turno sea el precio por hora; y una
  // hora y media, que es la que descubre si la duración se está redondeando mal.
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
    cancha,
    canchaEnMantenimiento,
    turnoLibre,
    otroTurnoLibre,
    turnoPasado,
    turnoEnMantenimiento
  };
};

/**
 * Firma un token para el usuario dado, igual que lo hace `auth.controller.js`.
 *
 * Los tests que no están probando el login entran por acá en vez de hacer un
 * `POST /api/auth/login`: se ahorran una comparación de bcrypt por request y no
 * fallan por un motivo ajeno a lo que están probando. El token es real, así que
 * el middleware lo verifica de verdad.
 */
const tokenDe = (usuario) =>
  jwt.sign({ id: usuario.id, rol: usuario.rol.nombre }, configJwt.secreto, {
    expiresIn: configJwt.expiracion
  });

/** Cabecera lista para encadenar: `.set(...autorizacion(usuario))`. */
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

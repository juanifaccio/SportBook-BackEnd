const path = require('node:path');

// El `.env` se busca a partir de la ubicación de este archivo y no del directorio
// desde el que se ejecuta el proceso —que es lo que hace dotenv por defecto—,
// para que el servidor levante igual arrancándolo desde cualquier carpeta.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

// Único lugar donde se lee `process.env`. Se valida todo al arrancar, así una
// variable faltante o mal escrita falla acá —con un mensaje que dice qué hacer—
// y no en el primer request contra la base.

const PUERTO_POR_DEFECTO = 3000;
const PUERTO_MYSQL_POR_DEFECTO = 3306;

/** Cuánto vale un token antes de que haya que volver a iniciar sesión. */
const EXPIRACION_JWT_POR_DEFECTO = '8h';

/**
 * Largo mínimo del secreto con el que se firman los tokens. Un secreto corto se
 * adivina por fuerza bruta, y con él se puede firmar un token de administrador.
 */
const LARGO_MINIMO_SECRETO = 32;

const requerida = (nombre) => {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Copiá .env.example a .env y completalo (ver README).`
    );
  }
  return valor;
};

const leerPuerto = () => {
  if (!process.env.PORT) return PUERTO_POR_DEFECTO;

  const puerto = Number(process.env.PORT);
  if (!Number.isInteger(puerto) || puerto <= 0 || puerto > 65535) {
    throw new Error(`PORT tiene que ser un número de puerto válido; llegó "${process.env.PORT}".`);
  }
  return puerto;
};

// La conexión llega como una sola URL —la misma que usa el CLI de Prisma para
// las migraciones— y se desarma acá. Repetir host, usuario y contraseña en
// variables sueltas dejaría dos configuraciones que pueden terminar apuntando a
// bases distintas.
const leerBaseDeDatos = () => {
  const valor = requerida('DATABASE_URL');

  let url;
  try {
    url = new URL(valor);
  } catch {
    throw new Error(
      'DATABASE_URL no es una URL válida. Se espera mysql://usuario:contrasena@host:puerto/base.'
    );
  }

  // Sin esto, un "localhost:3306" sin el esquema adelante pasa la validación:
  // `URL` lo lee como protocolo "localhost:" con la ruta "3306", y la conexión
  // termina armándose con datos que no significan nada.
  if (url.protocol !== 'mysql:') {
    throw new Error(
      `DATABASE_URL tiene que empezar con mysql://; llegó "${url.protocol}//".`
    );
  }

  const base = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!base) {
    throw new Error('DATABASE_URL no indica el nombre de la base de datos.');
  }

  return {
    host: url.hostname,
    puerto: Number(url.port) || PUERTO_MYSQL_POR_DEFECTO,
    usuario: decodeURIComponent(url.username),
    contrasena: decodeURIComponent(url.password),
    base
  };
};

// El secreto de firma es lo único que separa un token legítimo de uno fabricado,
// así que no tiene valor por defecto: sin él el servidor no arranca. Uno
// hardcodeado como reserva sería público —está en el repo— y cualquiera podría
// firmarse un token de administrador.
const leerJwt = () => {
  const secreto = requerida('JWT_SECRET');

  if (secreto.length < LARGO_MINIMO_SECRETO) {
    throw new Error(
      `JWT_SECRET tiene que tener al menos ${LARGO_MINIMO_SECRETO} caracteres. ` +
        'Podés generar uno con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }

  return {
    secreto,
    // Formato de `jsonwebtoken`: "8h", "30m", "7d".
    expiracion: process.env.JWT_EXPIRACION || EXPIRACION_JWT_POR_DEFECTO
  };
};

/**
 * Credenciales del administrador inicial que siembra `prisma/seed.js`.
 *
 * Es una función y no un valor como los demás porque solo las necesita el seed:
 * el servidor tiene que poder arrancar sin ellas, pero la validación vive igual
 * acá, que es el único lugar que lee `process.env`.
 */
const leerAdminInicial = () => ({
  email: requerida('ADMIN_EMAIL').trim().toLowerCase(),
  contrasena: requerida('ADMIN_CONTRASENA')
});

module.exports = {
  puerto: leerPuerto(),
  baseDeDatos: leerBaseDeDatos(),
  jwt: leerJwt(),
  leerAdminInicial
};

const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const PUERTO_POR_DEFECTO = 3000;
const PUERTO_MYSQL_POR_DEFECTO = 3306;

const EXPIRACION_JWT_POR_DEFECTO = '8h';

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
    expiracion: process.env.JWT_EXPIRACION || EXPIRACION_JWT_POR_DEFECTO
  };
};

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

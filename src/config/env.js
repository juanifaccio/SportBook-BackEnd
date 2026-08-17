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

module.exports = {
  puerto: leerPuerto(),
  baseDeDatos: leerBaseDeDatos()
};

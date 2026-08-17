const jwt = require('jsonwebtoken');

const prisma = require('../config/prisma');
const { jwt: configJwt } = require('../config/env');

/** Esquema con el que viaja el token en la cabecera `Authorization`. */
const ESQUEMA = 'Bearer ';

/**
 * Comprueba que el request traiga un token válido y deja el usuario en
 * `req.usuario` para que los controllers sepan quién está pidiendo.
 *
 * El usuario se relee de la base en cada request en vez de confiar en lo que dice
 * el token. Cuesta una consulta, pero un token es válido hasta que expira: si se
 * confiara en su contenido, alguien dado de baja o borrado seguiría entrando
 * durante horas, y un cambio de rol no tendría efecto hasta que volviera a
 * iniciar sesión.
 */
const autenticar = async (req, res, next) => {
  const cabecera = req.headers.authorization || '';

  if (!cabecera.startsWith(ESQUEMA)) {
    return res.status(401).json({
      mensaje: 'Necesitás iniciar sesión para realizar esta acción'
    });
  }

  const token = cabecera.slice(ESQUEMA.length).trim();

  let contenido;

  try {
    contenido = jwt.verify(token, configJwt.secreto);
  } catch (error) {
    // Tanto un token vencido como uno con la firma cambiada terminan acá: al
    // cliente le sirve lo mismo en los dos casos —volver a iniciar sesión— y
    // distinguirlos solo le diría a quien lo fabricó qué le falló.
    return res.status(401).json({
      mensaje: 'La sesión expiró o el token no es válido. Iniciá sesión de nuevo.'
    });
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: {
        id: contenido.id
      },
      include: {
        rol: true
      }
    });

    if (!usuario) {
      return res.status(401).json({
        mensaje: 'La cuenta de la sesión ya no existe'
      });
    }

    // La baja lógica de un usuario tiene que cortarle el acceso, no solo
    // impedirle reservar: si no, quien fue dado de baja sigue entrando con el
    // token que ya tenía.
    //
    // Es 401 y no 403 porque lo que dejó de valer es la sesión, no el permiso
    // para este endpoint en particular. Esa distinción es la que le permite al
    // frontend deslogear ante un 401 y limitarse a avisar ante un 403.
    if (!usuario.activo) {
      return res.status(401).json({
        mensaje: 'La cuenta está dada de baja'
      });
    }

    const { contrasena, ...sinContrasena } = usuario;

    req.usuario = sinContrasena;

    next();
  } catch (error) {
    console.error(error);

    res.status(500).json({
      mensaje: 'Error al validar la sesión'
    });
  }
};

/**
 * Deja pasar solo a los roles indicados. Se usa después de `autenticar`, que es
 * quien deja el usuario en el request.
 *
 * Va en las rutas y no en los controllers para que quién puede llamar a cada
 * endpoint se lea en el mismo lugar donde se declara el endpoint.
 */
const autorizar =
  (...roles) =>
  (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({
        mensaje: 'Necesitás iniciar sesión para realizar esta acción'
      });
    }

    if (!roles.includes(req.usuario.rol.nombre)) {
      return res.status(403).json({
        mensaje: 'No tenés permisos para realizar esta acción'
      });
    }

    next();
  };

module.exports = {
  autenticar,
  autorizar
};

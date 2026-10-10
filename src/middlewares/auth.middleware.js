const jwt = require('jsonwebtoken');

const prisma = require('../config/prisma');
const { jwt: configJwt } = require('../config/env');

const ESQUEMA = 'Bearer ';

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

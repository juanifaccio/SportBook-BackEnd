const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = require('../config/prisma');
const { jwt: configJwt } = require('../config/env');
const {
    validarPerfil,
    validarCambioDeContrasena,
    aRespuesta,
    RONDAS_HASH
} = require('./usuario.controller');

const CODIGO_DUPLICADO = 'P2002';

const CREDENCIALES_INVALIDAS = 'Email o contraseña incorrectos';

const firmarToken = (usuario) =>
  jwt.sign({ id: usuario.id, rol: usuario.rol.nombre }, configJwt.secreto, {
    expiresIn: configJwt.expiracion
  });

const iniciarSesion = async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const contrasena = typeof req.body.contrasena === 'string' ? req.body.contrasena : '';

    if (!email || !contrasena) {
      return res.status(400).json({
        mensaje: 'El email y la contraseña son obligatorios'
      });
    }

    const usuario = await prisma.usuario.findUnique({
      where: {
        email: email
      },
      include: {
        rol: true
      }
    });

    if (!usuario) {
      return res.status(401).json({
        mensaje: CREDENCIALES_INVALIDAS
      });
    }

    const coincide = await bcrypt.compare(contrasena, usuario.contrasena);

    if (!coincide) {
      return res.status(401).json({
        mensaje: CREDENCIALES_INVALIDAS
      });
    }

    if (!usuario.activo) {
      return res.status(403).json({
        mensaje: 'La cuenta está dada de baja. Contactate con el complejo.'
      });
    }

    const { contrasena: hash, ...sinContrasena } = usuario;

    res.json({
      token: firmarToken(usuario),
      usuario: sinContrasena
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      mensaje: 'Error al iniciar sesión'
    });
  }
};

const obtenerPerfil = (req, res) => {
  res.json(req.usuario);
};

const actualizarPerfil = async (req, res) => {
  try {
    const { mensaje, datos } = validarPerfil(req.body);

    if (mensaje) {
      return res.status(400).json({
        mensaje: mensaje
      });
    }

    const usuario = await prisma.usuario.update({
      where: {
        id: req.usuario.id
      },
      data: datos,
      include: {
        rol: true
      }
    });

    res.json(aRespuesta(usuario));
  } catch (error) {
    if (error.code === CODIGO_DUPLICADO) {
      return res.status(409).json({
        mensaje: 'Ya existe un usuario con ese email'
      });
    }

    console.error(error);

    res.status(500).json({
      mensaje: 'Error al actualizar el perfil'
    });
  }
};

const cambiarContrasena = async (req, res) => {
  try {
    const { mensaje, datos } = validarCambioDeContrasena(req.body);

    if (mensaje) {
      return res.status(400).json({
        mensaje: mensaje
      });
    }

    const usuario = await prisma.usuario.findUnique({
      where: {
        id: req.usuario.id
      }
    });

    const coincide = await bcrypt.compare(datos.actual, usuario.contrasena);

    if (!coincide) {
      return res.status(400).json({
        mensaje: 'La contraseña actual no es correcta'
      });
    }

    await prisma.usuario.update({
      where: {
        id: req.usuario.id
      },
      data: {
        contrasena: await bcrypt.hash(datos.nueva, RONDAS_HASH)
      }
    });

    res.json({
      mensaje: 'Contraseña actualizada correctamente'
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      mensaje: 'Error al cambiar la contraseña'
    });
  }
};

module.exports = {
  iniciarSesion,
  obtenerPerfil,
  actualizarPerfil,
  cambiarContrasena
};

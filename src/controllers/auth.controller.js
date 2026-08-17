const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = require('../config/prisma');
const { jwt: configJwt } = require('../config/env');

/**
 * Mismo texto para "ese email no existe" y "la contraseña no es esa". Distinguir
 * los dos casos le confirmaría a quien prueba combinaciones qué emails están
 * registrados, que es la mitad del trabajo de adivinar una cuenta.
 */
const CREDENCIALES_INVALIDAS = 'Email o contraseña incorrectos';

/**
 * Arma el token de la sesión. Lleva lo mínimo para saber quién es y qué puede
 * hacer; el rol viaja para poder leerlo en el frontend sin pedir el perfil, pero
 * el backend igual lo revalida contra la base en cada request (ver
 * `auth.middleware.js`): lo que viene firmado por el cliente no manda.
 */
const firmarToken = (usuario) =>
  jwt.sign({ id: usuario.id, rol: usuario.rol.nombre }, configJwt.secreto, {
    expiresIn: configJwt.expiracion
  });

/**
 * Valida el usuario y la contraseña y devuelve el token de la sesión junto con
 * el usuario, para que el frontend pueda mostrar su nombre y decidir qué
 * pantallas ofrecerle sin una segunda llamada.
 */
const iniciarSesion = async (req, res) => {
  try {
    // El email se guarda en minúsculas (ver `usuario.controller.js`), así que se
    // normaliza igual acá: escribirlo con mayúsculas no tiene que impedir entrar.
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

    // Recién con la contraseña ya validada se informa el estado de la cuenta:
    // antes, sería una forma de averiguar qué emails están registrados.
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

/**
 * Devuelve el usuario de la sesión en curso.
 *
 * El frontend lo usa al recargar la página: el token sobrevive en el navegador,
 * pero el usuario que tenía guardado puede haber cambiado de rol o haber sido
 * dado de baja desde entonces. Como el trabajo lo hizo `autenticar`, que ya lo
 * releyó de la base, acá solo queda responderlo.
 */
const obtenerPerfil = (req, res) => {
  res.json(req.usuario);
};

module.exports = {
  iniciarSesion,
  obtenerPerfil
};

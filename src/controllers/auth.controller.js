const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = require('../config/prisma');
const { jwt: configJwt } = require('../config/env');
// Las reglas de los campos de Usuario viven con Usuario: el mismo email mal
// escrito tiene que quejarse igual en el ABM de administración y acá.
const {
    validarPerfil,
    validarCambioDeContrasena,
    aRespuesta,
    RONDAS_HASH
} = require('./usuario.controller');

/** Código con el que Prisma reporta la violación de un índice único. */
const CODIGO_DUPLICADO = 'P2002';

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

/**
 * Actualiza los datos del usuario de la sesión.
 *
 * Va sobre el usuario de la sesión y no sobre un `:id` a propósito: si tomara un
 * id, habría que comprobar en cada request que ese id es el suyo, y alcanzaría
 * con olvidarse una vez para que cualquiera editara la cuenta de otro. Acá el id
 * no puede ser el de otro porque no llega del cliente.
 *
 * `rol` y `activo` no se pueden tocar desde acá: los filtra `validarPerfil`.
 */
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

/**
 * Cambia la contraseña del usuario de la sesión.
 *
 * Tiene endpoint propio y no viaja con el resto de los datos porque pide algo
 * que el formulario del perfil no tiene: la contraseña actual.
 *
 * El token sigue valiendo después del cambio. No hay lista de tokens revocados
 * (ver `auth.routes.js`), y además es lo que conviene: quien se cambia la clave
 * no tiene por qué quedar deslogueado.
 */
const cambiarContrasena = async (req, res) => {
  try {
    const { mensaje, datos } = validarCambioDeContrasena(req.body);

    if (mensaje) {
      return res.status(400).json({
        mensaje: mensaje
      });
    }

    // `req.usuario` viene sin la contraseña, así que el hash hay que ir a
    // buscarlo: es lo único que falta para poder comparar.
    const usuario = await prisma.usuario.findUnique({
      where: {
        id: req.usuario.id
      }
    });

    const coincide = await bcrypt.compare(datos.actual, usuario.contrasena);

    // 400 y no 401: la sesión sirve perfectamente, lo que está mal es un dato
    // del formulario. Con un 401 el frontend cerraría la sesión y echaría al
    // usuario por haberse equivocado al tipear.
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

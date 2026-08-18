const express = require('express');

const {
  iniciarSesion,
  obtenerPerfil,
  actualizarPerfil,
  cambiarContrasena
} = require('../controllers/auth.controller');
const { autenticar } = require('../middlewares/auth.middleware');

const router = express.Router();

// El único endpoint público de la API: es por donde se consigue el token que
// piden todos los demás.
router.post('/login', iniciarSesion);

// El perfil propio no lleva `autorizar`: no depende del rol, cualquiera con
// sesión gestiona su propia cuenta. Lo que sí está acotado es *qué* se puede
// cambiar —el rol y la baja lógica no—, y eso lo resuelve el controller.
router.get('/yo', autenticar, obtenerPerfil);
router.put('/yo', autenticar, actualizarPerfil);
router.put('/yo/contrasena', autenticar, cambiarContrasena);

// No hay logout: el token no se guarda en el servidor, así que cerrar sesión es
// que el cliente lo tire. Una lista de tokens revocados sería estado compartido
// para un beneficio que, con sesiones de pocas horas, no se nota.

module.exports = router;

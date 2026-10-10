const express = require('express');

const {
  iniciarSesion,
  obtenerPerfil,
  actualizarPerfil,
  cambiarContrasena
} = require('../controllers/auth.controller');
const { autenticar } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/login', iniciarSesion);

router.get('/yo', autenticar, obtenerPerfil);
router.put('/yo', autenticar, actualizarPerfil);
router.put('/yo/contrasena', autenticar, cambiarContrasena);

module.exports = router;

const express = require('express');

const { iniciarSesion, obtenerPerfil } = require('../controllers/auth.controller');
const { autenticar } = require('../middlewares/auth.middleware');

const router = express.Router();

// El único endpoint público de la API: es por donde se consigue el token que
// piden todos los demás.
router.post('/login', iniciarSesion);

router.get('/yo', autenticar, obtenerPerfil);

// No hay logout: el token no se guarda en el servidor, así que cerrar sesión es
// que el cliente lo tire. Una lista de tokens revocados sería estado compartido
// para un beneficio que, con sesiones de pocas horas, no se nota.

module.exports = router;

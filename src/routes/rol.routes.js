const express = require('express');

const { listarRoles } = require('../controllers/rol.controller');
const { autenticar, autorizar } = require('../middlewares/auth.middleware');
const ROLES = require('../config/roles');

const router = express.Router();

// Solo lectura: el catálogo se siembra por migración. Ver rol.controller.js.
// Y solo para administradores: el único que elige roles es el formulario de
// usuario, que ya es de administración.
router.get('/', autenticar, autorizar(ROLES.ADMIN), listarRoles);

module.exports = router;

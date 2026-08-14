const express = require('express');

const { listarRoles } = require('../controllers/rol.controller');

const router = express.Router();

// Solo lectura: el catálogo se siembra por migración. Ver rol.controller.js.
router.get('/', listarRoles);

module.exports = router;

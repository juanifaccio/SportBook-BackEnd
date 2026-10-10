const express = require('express');

const { listarRoles } = require('../controllers/rol.controller');
const { autenticar, autorizar } = require('../middlewares/auth.middleware');
const ROLES = require('../config/roles');

const router = express.Router();

router.get('/', autenticar, autorizar(ROLES.ADMIN), listarRoles);

module.exports = router;

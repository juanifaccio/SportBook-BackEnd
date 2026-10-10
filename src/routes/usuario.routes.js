const express = require('express');

const {
    listarUsuarios,
    crearUsuario,
    obtenerUsuario,
    actualizarUsuario,
    eliminarUsuario
} = require('../controllers/usuario.controller');
const { autenticar, autorizar } = require('../middlewares/auth.middleware');
const ROLES = require('../config/roles');

const router = express.Router();

router.use(autenticar, autorizar(ROLES.ADMIN));

router.get('/', listarUsuarios);
router.post('/', crearUsuario);
router.get('/:id', obtenerUsuario);
router.put('/:id', actualizarUsuario);
router.delete('/:id', eliminarUsuario);

module.exports = router;

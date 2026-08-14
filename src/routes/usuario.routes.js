const express = require('express');

const {
    listarUsuarios,
    crearUsuario,
    obtenerUsuario,
    actualizarUsuario,
    eliminarUsuario
} = require('../controllers/usuario.controller');

const router = express.Router();

router.get('/', listarUsuarios);
router.post('/', crearUsuario);
router.get('/:id', obtenerUsuario);
router.put('/:id', actualizarUsuario);
router.delete('/:id', eliminarUsuario);

module.exports = router;

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

// El recurso entero es de administración: son las cuentas de la aplicación, con
// los datos de contacto de todos los clientes y el rol —el nivel de acceso— de
// cada uno. Un cliente no lista a los demás ni se cambia el rol a sí mismo.
router.use(autenticar, autorizar(ROLES.ADMIN));

router.get('/', listarUsuarios);
router.post('/', crearUsuario);
router.get('/:id', obtenerUsuario);
router.put('/:id', actualizarUsuario);
router.delete('/:id', eliminarUsuario);

module.exports = router;

const express = require('express');

const {
    listarTiposCancha,
    crearTipoCancha,
    obtenerTipoCancha,
    actualizarTipoCancha,
    eliminarTipoCancha
} = require('../controllers/tipoCancha.controller');
const { autenticar, autorizar } = require('../middlewares/auth.middleware');
const ROLES = require('../config/roles');

const router = express.Router();

// Todo el recurso pide sesión: cualquiera que la tenga puede consultar el
// catálogo —lo necesita para elegir dónde jugar—, pero administrarlo es cosa
// del complejo.
router.use(autenticar);

router.get('/', listarTiposCancha);
router.post('/', autorizar(ROLES.ADMIN), crearTipoCancha);
router.get('/:id', obtenerTipoCancha);
router.put('/:id', autorizar(ROLES.ADMIN), actualizarTipoCancha);
router.delete('/:id', autorizar(ROLES.ADMIN), eliminarTipoCancha);

module.exports = router;
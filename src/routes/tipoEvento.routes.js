const express = require('express');

const {
    listarTiposEvento,
    crearTipoEvento,
    obtenerTipoEvento,
    actualizarTipoEvento,
    eliminarTipoEvento
} = require('../controllers/tipoEvento.controller');
const { autenticar, autorizar } = require('../middlewares/auth.middleware');
const ROLES = require('../config/roles');

const router = express.Router();

router.use(autenticar);

router.get('/', listarTiposEvento);
router.post('/', autorizar(ROLES.ADMIN), crearTipoEvento);
router.get('/:id', obtenerTipoEvento);
router.put('/:id', autorizar(ROLES.ADMIN), actualizarTipoEvento);
router.delete('/:id', autorizar(ROLES.ADMIN), eliminarTipoEvento);

module.exports = router;

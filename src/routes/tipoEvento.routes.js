const express = require('express');

const {
    listarTiposEvento,
    crearTipoEvento,
    obtenerTipoEvento,
    actualizarTipoEvento,
    eliminarTipoEvento
} = require('../controllers/tipoEvento.controller');

const router = express.Router();

router.get('/', listarTiposEvento);
router.post('/', crearTipoEvento);
router.get('/:id', obtenerTipoEvento);
router.put('/:id', actualizarTipoEvento);
router.delete('/:id', eliminarTipoEvento);

module.exports = router;

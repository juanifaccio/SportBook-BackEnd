const express = require('express');

const {
    listarTiposCancha,
    crearTipoCancha,
    obtenerTipoCancha,
    actualizarTipoCancha,
    eliminarTipoCancha
} = require('../controllers/tipoCancha.controller');

const router = express.Router();

router.get('/', listarTiposCancha);
router.post('/', crearTipoCancha);
router.get('/:id', obtenerTipoCancha);
router.put('/:id', actualizarTipoCancha);
router.delete('/:id', eliminarTipoCancha);

module.exports = router;
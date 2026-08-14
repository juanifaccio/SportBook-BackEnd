const express = require('express');

const {
    listarCanchas,
    crearCancha,
    obtenerCancha,
    actualizarCancha,
    eliminarCancha
} = require('../controllers/cancha.controller');

const router = express.Router();

router.get('/', listarCanchas);
router.post('/', crearCancha);
router.get('/:id', obtenerCancha);
router.put('/:id', actualizarCancha);
router.delete('/:id', eliminarCancha);

module.exports = router;

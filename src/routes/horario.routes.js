const express = require('express');

const {
    listarHorarios,
    crearHorario,
    obtenerHorario,
    actualizarHorario,
    eliminarHorario
} = require('../controllers/horario.controller');

const router = express.Router();

router.get('/', listarHorarios);
router.post('/', crearHorario);
router.get('/:id', obtenerHorario);
router.put('/:id', actualizarHorario);
router.delete('/:id', eliminarHorario);

module.exports = router;

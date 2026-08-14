const express = require('express');

const {
    listarReservas,
    crearReserva,
    obtenerReserva
} = require('../controllers/reserva.controller');

const router = express.Router();

// Sin PUT ni DELETE: modificar y cancelar una reserva son la tarea #10.
router.get('/', listarReservas);
router.post('/', crearReserva);
router.get('/:id', obtenerReserva);

module.exports = router;

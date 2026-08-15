const express = require('express');

const {
    listarReservas,
    crearReserva,
    obtenerReserva,
    actualizarReserva,
    cancelarReserva
} = require('../controllers/reserva.controller');

const router = express.Router();

router.get('/', listarReservas);
router.post('/', crearReserva);
router.get('/:id', obtenerReserva);

// Cancelar tiene URL propia en vez de ser un `PUT` con `{ estado }`: así el
// cliente no puede poner la reserva en cualquier estado, solo pedir la única
// transición que el negocio le permite. Va declarada antes que `/:id` porque es
// la ruta más específica de las dos.
router.put('/:id/cancelar', cancelarReserva);

// Lo único modificable de una reserva es el turno; el resto lo deriva el backend.
router.put('/:id', actualizarReserva);

// No hay DELETE a propósito: cancelar no es borrar. La reserva cancelada se
// conserva como historial y lo que se libera es el turno.

module.exports = router;

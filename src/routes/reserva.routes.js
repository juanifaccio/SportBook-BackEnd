const express = require('express');

const {
    listarReservas,
    crearReserva,
    obtenerReserva,
    actualizarReserva,
    cancelarReserva
} = require('../controllers/reserva.controller');
const { autenticar } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(autenticar);

router.get('/', listarReservas);
router.post('/', crearReserva);
router.get('/:id', obtenerReserva);

router.put('/:id/cancelar', cancelarReserva);

router.put('/:id', actualizarReserva);

module.exports = router;

const express = require('express');

const {
    listarEventos,
    crearEvento,
    obtenerEvento,
    actualizarEvento,
    eliminarEvento
} = require('../controllers/evento.controller');
const { autenticar } = require('../middlewares/auth.middleware');

const router = express.Router();

// Mismo caso que las reservas: acá no alcanza con el rol. Las cinco operaciones
// las puede pedir tanto un administrador como un cliente, pero el cliente solo
// sobre los eventos de sus propias reservas. Eso no se puede resolver mirando la
// URL —hay que ver de quién es la reserva del otro lado—, así que lo aplica el
// controller.
router.use(autenticar);

router.get('/', listarEventos);
router.post('/', crearEvento);
router.get('/:id', obtenerEvento);
router.put('/:id', actualizarEvento);
router.delete('/:id', eliminarEvento);

module.exports = router;

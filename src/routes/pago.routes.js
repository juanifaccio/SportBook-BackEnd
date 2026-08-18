const express = require('express');

const {
    listarPagos,
    crearPago,
    obtenerPago,
    actualizarPago,
    anularPago
} = require('../controllers/pago.controller');
const { autenticar, autorizar } = require('../middlewares/auth.middleware');
const ROLES = require('../config/roles');

const router = express.Router();

// Los permisos están partidos: la plata la cobra el complejo, así que registrar,
// corregir y anular son cosa del administrador y eso sí se puede declarar acá.
// La lectura no: un cliente ve los pagos de sus propias reservas, y de quién es
// la reserva del otro lado no se sabe mirando la URL, así que lo aplica el
// controller.
router.use(autenticar);

router.get('/', listarPagos);
router.post('/', autorizar(ROLES.ADMIN), crearPago);
router.get('/:id', obtenerPago);

// Anular tiene URL propia porque no es editar el pago sino cambiarle el estado, y
// además recalcula el de la reserva. Va declarada antes que `/:id` por ser la
// más específica de las dos.
router.put('/:id/anular', autorizar(ROLES.ADMIN), anularPago);
router.put('/:id', autorizar(ROLES.ADMIN), actualizarPago);

// No hay DELETE a propósito: un pago es un registro de plata y se conserva como
// historial. Anular no es borrar.

module.exports = router;

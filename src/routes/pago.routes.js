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

router.use(autenticar);

router.get('/', listarPagos);
router.post('/', autorizar(ROLES.ADMIN), crearPago);
router.get('/:id', obtenerPago);

router.put('/:id/anular', autorizar(ROLES.ADMIN), anularPago);
router.put('/:id', autorizar(ROLES.ADMIN), actualizarPago);

module.exports = router;

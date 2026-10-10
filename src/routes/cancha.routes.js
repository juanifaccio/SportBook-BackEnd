const express = require('express');

const {
    listarCanchas,
    crearCancha,
    obtenerCancha,
    actualizarCancha,
    eliminarCancha
} = require('../controllers/cancha.controller');
const { autenticar, autorizar } = require('../middlewares/auth.middleware');
const ROLES = require('../config/roles');

const router = express.Router();

router.use(autenticar);

router.get('/', listarCanchas);
router.post('/', autorizar(ROLES.ADMIN), crearCancha);
router.get('/:id', obtenerCancha);
router.put('/:id', autorizar(ROLES.ADMIN), actualizarCancha);
router.delete('/:id', autorizar(ROLES.ADMIN), eliminarCancha);

module.exports = router;

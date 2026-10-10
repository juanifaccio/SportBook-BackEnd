const express = require('express');

const {
    listarHorarios,
    crearHorario,
    generarHorarios,
    obtenerHorario,
    actualizarHorario,
    eliminarHorario
} = require('../controllers/horario.controller');
const { autenticar, autorizar } = require('../middlewares/auth.middleware');
const ROLES = require('../config/roles');

const router = express.Router();

router.use(autenticar);

router.get('/', listarHorarios);
router.post('/', autorizar(ROLES.ADMIN), crearHorario);
router.post('/lote', autorizar(ROLES.ADMIN), generarHorarios);
router.get('/:id', obtenerHorario);
router.put('/:id', autorizar(ROLES.ADMIN), actualizarHorario);
router.delete('/:id', autorizar(ROLES.ADMIN), eliminarHorario);

module.exports = router;

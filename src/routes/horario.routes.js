const express = require('express');

const {
    listarHorarios,
    crearHorario,
    obtenerHorario,
    actualizarHorario,
    eliminarHorario
} = require('../controllers/horario.controller');
const { autenticar, autorizar } = require('../middlewares/auth.middleware');
const ROLES = require('../config/roles');

const router = express.Router();

// El cliente consulta los turnos para elegir uno libre; cargarlos y darlos de
// baja es del complejo, que es quien define la grilla de la cancha.
router.use(autenticar);

router.get('/', listarHorarios);
router.post('/', autorizar(ROLES.ADMIN), crearHorario);
router.get('/:id', obtenerHorario);
router.put('/:id', autorizar(ROLES.ADMIN), actualizarHorario);
router.delete('/:id', autorizar(ROLES.ADMIN), eliminarHorario);

module.exports = router;

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

// Las canchas se leen con sesión —la pantalla de reservar arranca eligiendo
// una— y las da de alta, edita y baja el complejo.
router.use(autenticar);

router.get('/', listarCanchas);
router.post('/', autorizar(ROLES.ADMIN), crearCancha);
router.get('/:id', obtenerCancha);
router.put('/:id', autorizar(ROLES.ADMIN), actualizarCancha);
router.delete('/:id', autorizar(ROLES.ADMIN), eliminarCancha);

module.exports = router;

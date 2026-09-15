const express = require('express');

const {
    listarEquipamientos,
    crearEquipamiento,
    obtenerEquipamiento,
    actualizarEquipamiento,
    eliminarEquipamiento
} = require('../controllers/equipamiento.controller');
const { autenticar, autorizar } = require('../middlewares/auth.middleware');
const ROLES = require('../config/roles');

const router = express.Router();

// El catálogo se lee con sesión —el cliente lo va a necesitar para elegir qué
// alquila al reservar— y lo administra el complejo, como el resto del catálogo.
router.use(autenticar);

router.get('/', listarEquipamientos);
router.post('/', autorizar(ROLES.ADMIN), crearEquipamiento);
router.get('/:id', obtenerEquipamiento);
router.put('/:id', autorizar(ROLES.ADMIN), actualizarEquipamiento);
router.delete('/:id', autorizar(ROLES.ADMIN), eliminarEquipamiento);

module.exports = router;

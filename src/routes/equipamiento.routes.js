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

router.use(autenticar);

router.get('/', listarEquipamientos);
router.post('/', autorizar(ROLES.ADMIN), crearEquipamiento);
router.get('/:id', obtenerEquipamiento);
router.put('/:id', autorizar(ROLES.ADMIN), actualizarEquipamiento);
router.delete('/:id', autorizar(ROLES.ADMIN), eliminarEquipamiento);

module.exports = router;

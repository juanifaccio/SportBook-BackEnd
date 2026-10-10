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

router.use(autenticar);

router.get('/', listarEventos);
router.post('/', crearEvento);
router.get('/:id', obtenerEvento);
router.put('/:id', actualizarEvento);
router.delete('/:id', eliminarEvento);

module.exports = router;

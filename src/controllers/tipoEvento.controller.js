const prisma = require('../config/prisma');

const listarTiposEvento = async (req, res) => {
    try {
        const tiposEvento = await prisma.tipoEvento.findMany();

        res.json(tiposEvento);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al listar los tipos de evento'
        });
    }
};

const crearTipoEvento = async (req, res) => {
    try {
        const { nombre } = req.body;

        if (!nombre) {
            return res.status(400).json({
                mensaje: 'El nombre es obligatorio'
            });
        }

        const tipoEvento = await prisma.tipoEvento.create({
            data: {
                nombre
            }
        });

        res.status(201).json(tipoEvento);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al crear el tipo de evento'
        });
    }
};

const obtenerTipoEvento = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        const tipoEvento = await prisma.tipoEvento.findUnique({
            where: {
                id: id
            }
        });

        if (!tipoEvento) {
            return res.status(404).json({
                mensaje: 'Tipo de evento no encontrado'
            });
        }

        res.json(tipoEvento);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al obtener el tipo de evento'
        });
    }
};

const actualizarTipoEvento = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { nombre } = req.body;

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        if (!nombre) {
            return res.status(400).json({
                mensaje: 'El nombre es obligatorio'
            });
        }

        const tipoEventoExistente = await prisma.tipoEvento.findUnique({
            where: {
                id: id
            }
        });

        if (!tipoEventoExistente) {
            return res.status(404).json({
                mensaje: 'Tipo de evento no encontrado'
            });
        }

        const tipoEvento = await prisma.tipoEvento.update({
            where: {
                id: id
            },
            data: {
                nombre
            }
        });

        res.json(tipoEvento);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al actualizar el tipo de evento'
        });
    }
};

const eliminarTipoEvento = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        const tipoEventoExistente = await prisma.tipoEvento.findUnique({
            where: {
                id: id
            }
        });

        if (!tipoEventoExistente) {
            return res.status(404).json({
                mensaje: 'Tipo de evento no encontrado'
            });
        }

        await prisma.tipoEvento.delete({
            where: {
                id: id
            }
        });

        res.json({
            mensaje: 'Tipo de evento eliminado correctamente'
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al eliminar el tipo de evento'
        });
    }
};

module.exports = {
    listarTiposEvento,
    crearTipoEvento,
    obtenerTipoEvento,
    actualizarTipoEvento,
    eliminarTipoEvento
};

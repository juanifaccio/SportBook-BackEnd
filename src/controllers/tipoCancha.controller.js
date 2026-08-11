const prisma = require('../config/prisma');

const listarTiposCancha = async (req, res) => {
    const tiposCancha = await prisma.tipoCancha.findMany();

    res.json(tiposCancha);
};

const crearTipoCancha = async (req, res) => {
    try {
        const { nombre, descripcion } = req.body;

        if (!nombre || !descripcion) {
            return res.status(400).json({
                mensaje: 'Nombre y descripción son obligatorios'
            });
        }

        const tipoCancha = await prisma.tipoCancha.create({
            data: {
                nombre,
                descripcion
            }
        });

        res.status(201).json(tipoCancha);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            mensaje: 'Error al crear el tipo de cancha'
        });
    }
};

const obtenerTipoCancha = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        const tipoCancha = await prisma.tipoCancha.findUnique({
            where: {
                id: id
            }
        });

        if (!tipoCancha) {
            return res.status(404).json({
                mensaje: 'Tipo de cancha no encontrado'
            });
        }

        res.json(tipoCancha);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            mensaje: 'Error al obtener el tipo de cancha'
        });
    }
};

const actualizarTipoCancha = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { nombre, descripcion } = req.body;

        if (!nombre || !descripcion) {
            return res.status(400).json({
                mensaje: 'Nombre y descripción son obligatorios'
            });
        }

        const tipoCanchaExistente = await prisma.tipoCancha.findUnique({
            where: {
                id: id
            }
        });

        if (!tipoCanchaExistente) {
            return res.status(404).json({
                mensaje: 'Tipo de cancha no encontrado'
            });
        }

        const tipoCancha = await prisma.tipoCancha.update({
            where: {
                id: id
            },
            data: {
                nombre,
                descripcion
            }
        });

        res.json(tipoCancha);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al actualizar el tipo de cancha'
        });
    }
};

const eliminarTipoCancha = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        const tipoCanchaExistente = await prisma.tipoCancha.findUnique({
            where: {
                id: id
            }
        });

        if (!tipoCanchaExistente) {
            return res.status(404).json({
                mensaje: 'Tipo de cancha no encontrado'
            });
        }

        await prisma.tipoCancha.delete({
            where: {
                id: id
            }
        });

        res.json({
            mensaje: 'Tipo de cancha eliminado correctamente'
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al eliminar el tipo de cancha'
        });
    }
};

module.exports = {
    listarTiposCancha,
    crearTipoCancha,
    obtenerTipoCancha,
    actualizarTipoCancha,
    eliminarTipoCancha
};
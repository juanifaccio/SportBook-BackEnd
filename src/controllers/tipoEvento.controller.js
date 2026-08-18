const prisma = require('../config/prisma');

/** Código con el que Prisma reporta la violación de un índice único. */
const CODIGO_DUPLICADO = 'P2002';

/** Código con el que Prisma reporta la violación de una clave foránea. */
const CODIGO_CLAVE_FORANEA = 'P2003';

/**
 * Normaliza el nombre recibido. El `trim` no es cosmético: la colación de la
 * base ignora mayúsculas, acentos y espacios al final, pero **no** los espacios
 * al principio, así que sin esto un " Cumpleaños" se colaría junto al que ya
 * existe y el índice único no lo detendría.
 */
const normalizarNombre = (nombre) => (typeof nombre === 'string' ? nombre.trim() : '');

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
        const nombre = normalizarNombre(req.body.nombre);

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
        if (error.code === CODIGO_DUPLICADO) {
            return res.status(409).json({
                mensaje: 'Ya existe un tipo de evento con ese nombre'
            });
        }

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
        const nombre = normalizarNombre(req.body.nombre);

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
        if (error.code === CODIGO_DUPLICADO) {
            return res.status(409).json({
                mensaje: 'Ya existe un tipo de evento con ese nombre'
            });
        }

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
        // La FK de Evento impide borrar un tipo que ya está en uso: sin esto el
        // error de la base saldría como un 500.
        if (error.code === CODIGO_CLAVE_FORANEA) {
            return res.status(409).json({
                mensaje: 'No se puede eliminar el tipo de evento porque tiene eventos asociados'
            });
        }

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

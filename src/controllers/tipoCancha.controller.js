const prisma = require('../config/prisma');

/** Código con el que Prisma reporta la violación de un índice único. */
const CODIGO_DUPLICADO = 'P2002';

/**
 * Normaliza un texto recibido del cliente. El `trim` del nombre no es cosmético:
 * la colación de la base ignora mayúsculas, acentos y espacios al final, pero
 * **no** los espacios al principio, así que sin esto un " Fútbol 5" se colaría
 * junto al que ya existe y el índice único no lo detendría.
 */
const normalizar = (texto) => (typeof texto === 'string' ? texto.trim() : '');

const listarTiposCancha = async (req, res) => {
    try {
        const tiposCancha = await prisma.tipoCancha.findMany();

        res.json(tiposCancha);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al listar los tipos de cancha'
        });
    }
};

const crearTipoCancha = async (req, res) => {
    try {
        const nombre = normalizar(req.body.nombre);
        const descripcion = normalizar(req.body.descripcion);

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
        if (error.code === CODIGO_DUPLICADO) {
            return res.status(409).json({
                mensaje: 'Ya existe un tipo de cancha con ese nombre'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al crear el tipo de cancha'
        });
    }
};

const obtenerTipoCancha = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

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
        const nombre = normalizar(req.body.nombre);
        const descripcion = normalizar(req.body.descripcion);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

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
        if (error.code === CODIGO_DUPLICADO) {
            return res.status(409).json({
                mensaje: 'Ya existe un tipo de cancha con ese nombre'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al actualizar el tipo de cancha'
        });
    }
};

const eliminarTipoCancha = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
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

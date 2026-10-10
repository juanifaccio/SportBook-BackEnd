const prisma = require('../config/prisma');
const { alquiladoEnTurno, disponiblesDe } = require('./reserva.controller');

const CODIGO_DUPLICADO = 'P2002';

const CODIGO_CLAVE_FORANEA = 'P2003';

const normalizar = (texto) => (typeof texto === 'string' ? texto.trim() : '');

const aRespuesta = (equipamiento) => ({
    ...equipamiento,
    precio: Number(equipamiento.precio)
});

const validarDatos = (body) => {
    const nombre = normalizar(body.nombre);
    const descripcion = normalizar(body.descripcion);
    const precio = Number(body.precio);
    const stock = Number(body.stock);

    if (!nombre) {
        return { mensaje: 'El nombre es obligatorio' };
    }

    if (!descripcion) {
        return { mensaje: 'La descripción es obligatoria' };
    }

    if (isNaN(precio) || precio <= 0) {
        return { mensaje: 'El precio debe ser un número mayor a cero' };
    }

    if (isNaN(stock) || !Number.isInteger(stock) || stock < 0) {
        return { mensaje: 'El stock debe ser un número entero mayor o igual a cero' };
    }

    return { datos: { nombre, descripcion, precio, stock } };
};

const buscarTurnoDelFiltro = async (query) => {
    if (query.horarioId === undefined) {
        return {};
    }

    const horarioId = parseInt(query.horarioId);

    if (isNaN(horarioId)) {
        return { codigo: 400, mensaje: 'El id del turno debe ser un número' };
    }

    const horario = await prisma.horario.findUnique({
        where: {
            id: horarioId
        }
    });

    if (!horario) {
        return { codigo: 404, mensaje: 'Turno no encontrado' };
    }

    return { horario };
};

const listarEquipamientos = async (req, res) => {
    try {
        const { codigo, mensaje, horario } = await buscarTurnoDelFiltro(req.query);

        if (mensaje) {
            return res.status(codigo).json({
                mensaje: mensaje
            });
        }

        const equipamientos = await prisma.equipamiento.findMany({
            orderBy: {
                nombre: 'asc'
            }
        });

        if (!horario) {
            return res.json(equipamientos.map(aRespuesta));
        }

        const alquilado = await alquiladoEnTurno(prisma, horario);

        res.json(
            equipamientos.map((equipamiento) => ({
                ...aRespuesta(equipamiento),
                disponibles: disponiblesDe(equipamiento, alquilado)
            }))
        );
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al listar el equipamiento'
        });
    }
};

const crearEquipamiento = async (req, res) => {
    try {
        const { mensaje, datos } = validarDatos(req.body);

        if (mensaje) {
            return res.status(400).json({
                mensaje: mensaje
            });
        }

        const equipamiento = await prisma.equipamiento.create({
            data: datos
        });

        res.status(201).json(aRespuesta(equipamiento));
    } catch (error) {
        if (error.code === CODIGO_DUPLICADO) {
            return res.status(409).json({
                mensaje: 'Ya existe un equipamiento con ese nombre'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al crear el equipamiento'
        });
    }
};

const obtenerEquipamiento = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        const equipamiento = await prisma.equipamiento.findUnique({
            where: {
                id: id
            }
        });

        if (!equipamiento) {
            return res.status(404).json({
                mensaje: 'Equipamiento no encontrado'
            });
        }

        res.json(aRespuesta(equipamiento));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al obtener el equipamiento'
        });
    }
};

const actualizarEquipamiento = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        const { mensaje, datos } = validarDatos(req.body);

        if (mensaje) {
            return res.status(400).json({
                mensaje: mensaje
            });
        }

        const equipamientoExistente = await prisma.equipamiento.findUnique({
            where: {
                id: id
            }
        });

        if (!equipamientoExistente) {
            return res.status(404).json({
                mensaje: 'Equipamiento no encontrado'
            });
        }

        const equipamiento = await prisma.equipamiento.update({
            where: {
                id: id
            },
            data: datos
        });

        res.json(aRespuesta(equipamiento));
    } catch (error) {
        if (error.code === CODIGO_DUPLICADO) {
            return res.status(409).json({
                mensaje: 'Ya existe un equipamiento con ese nombre'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al actualizar el equipamiento'
        });
    }
};

const eliminarEquipamiento = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        const equipamientoExistente = await prisma.equipamiento.findUnique({
            where: {
                id: id
            }
        });

        if (!equipamientoExistente) {
            return res.status(404).json({
                mensaje: 'Equipamiento no encontrado'
            });
        }

        await prisma.equipamiento.delete({
            where: {
                id: id
            }
        });

        res.json({
            mensaje: 'Equipamiento eliminado correctamente'
        });
    } catch (error) {
        if (error.code === CODIGO_CLAVE_FORANEA) {
            return res.status(409).json({
                mensaje: 'No se puede eliminar el equipamiento porque hay reservas que lo incluyen'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al eliminar el equipamiento'
        });
    }
};

module.exports = {
    listarEquipamientos,
    crearEquipamiento,
    obtenerEquipamiento,
    actualizarEquipamiento,
    eliminarEquipamiento,
    validarDatos,
    aRespuesta
};

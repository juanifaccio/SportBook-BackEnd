const prisma = require('../config/prisma');

const CODIGO_DUPLICADO = 'P2002';

const CODIGO_CLAVE_FORANEA = 'P2003';

const ESTADOS_VALIDOS = ['DISPONIBLE', 'MANTENIMIENTO'];

const normalizar = (texto) => (typeof texto === 'string' ? texto.trim() : '');

const aRespuesta = (cancha) => ({
    ...cancha,
    precioPorHora: Number(cancha.precioPorHora)
});

const validarDatos = (body) => {
    const nombre = normalizar(body.nombre);
    const precioPorHora = Number(body.precioPorHora);
    const estado = normalizar(body.estado);
    const tipoCanchaId = parseInt(body.tipoCanchaId);

    if (!nombre) {
        return { mensaje: 'El nombre es obligatorio' };
    }

    if (isNaN(precioPorHora) || precioPorHora <= 0) {
        return { mensaje: 'El precio por hora debe ser un número mayor a cero' };
    }

    if (!ESTADOS_VALIDOS.includes(estado)) {
        return { mensaje: 'El estado debe ser DISPONIBLE o MANTENIMIENTO' };
    }

    if (isNaN(tipoCanchaId)) {
        return { mensaje: 'El tipo de cancha es obligatorio' };
    }

    return { datos: { nombre, precioPorHora, estado, tipoCanchaId } };
};

const armarFiltro = (query) => {
    const filtro = {};

    if (query.tipoCanchaId !== undefined) {
        const tipoCanchaId = parseInt(query.tipoCanchaId);

        if (isNaN(tipoCanchaId)) {
            return { mensaje: 'El id del tipo de cancha debe ser un número' };
        }

        filtro.tipoCanchaId = tipoCanchaId;
    }

    return { filtro };
};

const listarCanchas = async (req, res) => {
    try {
        const { mensaje, filtro } = armarFiltro(req.query);

        if (mensaje) {
            return res.status(400).json({
                mensaje: mensaje
            });
        }

        const canchas = await prisma.cancha.findMany({
            where: filtro,
            include: {
                tipoCancha: true
            },
            orderBy: {
                nombre: 'asc'
            }
        });

        res.json(canchas.map(aRespuesta));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al listar las canchas'
        });
    }
};

const crearCancha = async (req, res) => {
    try {
        const { mensaje, datos } = validarDatos(req.body);

        if (mensaje) {
            return res.status(400).json({
                mensaje: mensaje
            });
        }

        const tipoCancha = await prisma.tipoCancha.findUnique({
            where: {
                id: datos.tipoCanchaId
            }
        });

        if (!tipoCancha) {
            return res.status(400).json({
                mensaje: 'El tipo de cancha indicado no existe'
            });
        }

        const cancha = await prisma.cancha.create({
            data: datos,
            include: {
                tipoCancha: true
            }
        });

        res.status(201).json(aRespuesta(cancha));
    } catch (error) {
        if (error.code === CODIGO_DUPLICADO) {
            return res.status(409).json({
                mensaje: 'Ya existe una cancha con ese nombre'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al crear la cancha'
        });
    }
};

const obtenerCancha = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        const cancha = await prisma.cancha.findUnique({
            where: {
                id: id
            },
            include: {
                tipoCancha: true
            }
        });

        if (!cancha) {
            return res.status(404).json({
                mensaje: 'Cancha no encontrada'
            });
        }

        res.json(aRespuesta(cancha));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al obtener la cancha'
        });
    }
};

const actualizarCancha = async (req, res) => {
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

        const canchaExistente = await prisma.cancha.findUnique({
            where: {
                id: id
            }
        });

        if (!canchaExistente) {
            return res.status(404).json({
                mensaje: 'Cancha no encontrada'
            });
        }

        const tipoCancha = await prisma.tipoCancha.findUnique({
            where: {
                id: datos.tipoCanchaId
            }
        });

        if (!tipoCancha) {
            return res.status(400).json({
                mensaje: 'El tipo de cancha indicado no existe'
            });
        }

        const cancha = await prisma.cancha.update({
            where: {
                id: id
            },
            data: datos,
            include: {
                tipoCancha: true
            }
        });

        res.json(aRespuesta(cancha));
    } catch (error) {
        if (error.code === CODIGO_DUPLICADO) {
            return res.status(409).json({
                mensaje: 'Ya existe una cancha con ese nombre'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al actualizar la cancha'
        });
    }
};

const eliminarCancha = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        const canchaExistente = await prisma.cancha.findUnique({
            where: {
                id: id
            }
        });

        if (!canchaExistente) {
            return res.status(404).json({
                mensaje: 'Cancha no encontrada'
            });
        }

        await prisma.cancha.delete({
            where: {
                id: id
            }
        });

        res.json({
            mensaje: 'Cancha eliminada correctamente'
        });
    } catch (error) {
        if (error.code === CODIGO_CLAVE_FORANEA) {
            return res.status(409).json({
                mensaje: 'No se puede eliminar la cancha porque tiene horarios asociados'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al eliminar la cancha'
        });
    }
};

module.exports = {
    listarCanchas,
    crearCancha,
    obtenerCancha,
    actualizarCancha,
    eliminarCancha,
    validarDatos,
    armarFiltro,
    aRespuesta
};

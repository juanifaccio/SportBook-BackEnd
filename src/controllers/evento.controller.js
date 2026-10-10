const prisma = require('../config/prisma');
const ROLES = require('../config/roles');
const { aRespuesta: reservaARespuesta } = require('./reserva.controller');

const CODIGO_DUPLICADO = 'P2002';

const ESTADO_CANCELADA = 'CANCELADA';

const esAdmin = (usuario) => usuario.rol.nombre === ROLES.ADMIN;

const esPropia = (reserva, usuario) => reserva.usuarioId === usuario.id;

const puedeGestionarlo = (evento, solicitante) =>
    esAdmin(solicitante) || esPropia(evento.reserva, solicitante);

const normalizar = (texto) => (typeof texto === 'string' ? texto.trim() : '');

const RELACIONES = {
    tipoEvento: true,
    reserva: {
        include: {
            usuario: true,
            cancha: {
                include: {
                    tipoCancha: true
                }
            }
        }
    }
};

const aRespuesta = (evento) => ({
    ...evento,
    reserva: evento.reserva && reservaARespuesta(evento.reserva)
});

const validarDatos = (body) => {
    const descripcion = normalizar(body.descripcion);
    const cantidadPersonas = Number(body.cantidadPersonas);
    const tipoEventoId = parseInt(body.tipoEventoId);

    if (!descripcion) {
        return { mensaje: 'La descripción es obligatoria' };
    }

    if (!Number.isInteger(cantidadPersonas) || cantidadPersonas <= 0) {
        return { mensaje: 'La cantidad de personas debe ser un número entero mayor a cero' };
    }

    if (isNaN(tipoEventoId)) {
        return { mensaje: 'El tipo de evento es obligatorio' };
    }

    return { datos: { descripcion, cantidadPersonas, tipoEventoId } };
};

const armarFiltro = (query) => {
    const filtro = {};

    if (query.reservaId !== undefined) {
        const reservaId = parseInt(query.reservaId);

        if (isNaN(reservaId)) {
            return { mensaje: 'El valor de reservaId debe ser un número' };
        }

        filtro.reservaId = reservaId;
    }

    return { filtro };
};

const buscarReservaParaEvento = async (reservaId, solicitante) => {
    const reserva = await prisma.reserva.findUnique({
        where: {
            id: reservaId
        }
    });

    if (!reserva) {
        return { codigo: 400, mensaje: 'La reserva indicada no existe' };
    }

    if (!esAdmin(solicitante) && !esPropia(reserva, solicitante)) {
        return { codigo: 403, mensaje: 'La reserva es de otro usuario' };
    }

    if (reserva.estado === ESTADO_CANCELADA) {
        return { codigo: 409, mensaje: 'La reserva está cancelada' };
    }

    return { reserva };
};

const listarEventos = async (req, res) => {
    try {
        const { mensaje, filtro } = armarFiltro(req.query);

        if (mensaje) {
            return res.status(400).json({
                mensaje: mensaje
            });
        }

        if (!esAdmin(req.usuario)) {
            filtro.reserva = {
                usuarioId: req.usuario.id
            };
        }

        const eventos = await prisma.evento.findMany({
            where: filtro,
            include: RELACIONES,
            orderBy: {
                reserva: {
                    fecha: 'desc'
                }
            }
        });

        res.json(eventos.map(aRespuesta));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al listar los eventos'
        });
    }
};

const crearEvento = async (req, res) => {
    try {
        const { mensaje, datos } = validarDatos(req.body);

        if (mensaje) {
            return res.status(400).json({
                mensaje: mensaje
            });
        }

        const reservaId = parseInt(req.body.reservaId);

        if (isNaN(reservaId)) {
            return res.status(400).json({
                mensaje: 'La reserva es obligatoria'
            });
        }

        const reservaBuscada = await buscarReservaParaEvento(reservaId, req.usuario);

        if (reservaBuscada.mensaje) {
            return res.status(reservaBuscada.codigo).json({
                mensaje: reservaBuscada.mensaje
            });
        }

        const tipoEvento = await prisma.tipoEvento.findUnique({
            where: {
                id: datos.tipoEventoId
            }
        });

        if (!tipoEvento) {
            return res.status(400).json({
                mensaje: 'El tipo de evento indicado no existe'
            });
        }

        const eventoExistente = await prisma.evento.findUnique({
            where: {
                reservaId: reservaId
            }
        });

        if (eventoExistente) {
            return res.status(409).json({
                mensaje: 'La reserva ya tiene un evento'
            });
        }

        const evento = await prisma.evento.create({
            data: {
                ...datos,
                reservaId: reservaId
            },
            include: RELACIONES
        });

        res.status(201).json(aRespuesta(evento));
    } catch (error) {
        if (error.code === CODIGO_DUPLICADO) {
            return res.status(409).json({
                mensaje: 'La reserva ya tiene un evento'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al crear el evento'
        });
    }
};

const obtenerEvento = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        const evento = await prisma.evento.findUnique({
            where: {
                id: id
            },
            include: RELACIONES
        });

        if (!evento) {
            return res.status(404).json({
                mensaje: 'Evento no encontrado'
            });
        }

        if (!puedeGestionarlo(evento, req.usuario)) {
            return res.status(403).json({
                mensaje: 'La reserva es de otro usuario'
            });
        }

        res.json(aRespuesta(evento));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al obtener el evento'
        });
    }
};

const actualizarEvento = async (req, res) => {
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

        const eventoExistente = await prisma.evento.findUnique({
            where: {
                id: id
            },
            include: {
                reserva: true
            }
        });

        if (!eventoExistente) {
            return res.status(404).json({
                mensaje: 'Evento no encontrado'
            });
        }

        if (!puedeGestionarlo(eventoExistente, req.usuario)) {
            return res.status(403).json({
                mensaje: 'La reserva es de otro usuario'
            });
        }

        if (eventoExistente.reserva.estado === ESTADO_CANCELADA) {
            return res.status(409).json({
                mensaje: 'La reserva está cancelada'
            });
        }

        const tipoEvento = await prisma.tipoEvento.findUnique({
            where: {
                id: datos.tipoEventoId
            }
        });

        if (!tipoEvento) {
            return res.status(400).json({
                mensaje: 'El tipo de evento indicado no existe'
            });
        }

        const evento = await prisma.evento.update({
            where: {
                id: id
            },
            data: datos,
            include: RELACIONES
        });

        res.json(aRespuesta(evento));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al actualizar el evento'
        });
    }
};

const eliminarEvento = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        const eventoExistente = await prisma.evento.findUnique({
            where: {
                id: id
            },
            include: {
                reserva: true
            }
        });

        if (!eventoExistente) {
            return res.status(404).json({
                mensaje: 'Evento no encontrado'
            });
        }

        if (!puedeGestionarlo(eventoExistente, req.usuario)) {
            return res.status(403).json({
                mensaje: 'La reserva es de otro usuario'
            });
        }

        await prisma.evento.delete({
            where: {
                id: id
            }
        });

        res.json({
            mensaje: 'Evento eliminado correctamente'
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al eliminar el evento'
        });
    }
};

module.exports = {
    listarEventos,
    crearEvento,
    obtenerEvento,
    actualizarEvento,
    eliminarEvento,
    validarDatos,
    armarFiltro,
    aRespuesta
};

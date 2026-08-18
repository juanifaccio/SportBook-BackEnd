const prisma = require('../config/prisma');
const ROLES = require('../config/roles');
// El evento viaja con su reserva adentro, y esa reserva necesita exactamente las
// mismas conversiones que cuando se la pide por su propio endpoint (la fecha
// DATE recortada, los Decimal a número, el usuario sin su contraseña). Se
// reutiliza la función del otro controller en vez de repetirla acá: son
// conversiones sutiles y dos copias se terminan desincronizando.
const { aRespuesta: reservaARespuesta } = require('./reserva.controller');

/** Código con el que Prisma reporta la violación de un índice único. */
const CODIGO_DUPLICADO = 'P2002';

/** Estado en el que una reserva ya no admite cambios en su evento. */
const ESTADO_CANCELADA = 'CANCELADA';

/**
 * Un evento es de quien es su reserva. El administrador los ve y los gestiona
 * todos —es el mostrador del complejo—; el cliente, solo los de sus reservas.
 *
 * Igual que en reservas, este control no puede vivir en las rutas: ahí se sabe
 * qué se está pidiendo, pero no de quién es la reserva que hay del otro lado.
 */
const esAdmin = (usuario) => usuario.rol.nombre === ROLES.ADMIN;

const esPropia = (reserva, usuario) => reserva.usuarioId === usuario.id;

const puedeGestionarlo = (evento, solicitante) =>
    esAdmin(solicitante) || esPropia(evento.reserva, solicitante);

/**
 * Normaliza un texto recibido del cliente. El `trim` de la descripción evita que
 * un campo con solo espacios pase como si estuviera cargado.
 */
const normalizar = (texto) => (typeof texto === 'string' ? texto.trim() : '');

/**
 * Relaciones que acompañan al evento en todas las respuestas. La reserva viaja
 * entera —con su cancha, su tipo de cancha y su usuario— porque el listado del
 * ABM tiene que poder identificar a cuál de todas pertenece el evento, y pedirla
 * aparte sería una consulta más por fila.
 */
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

/** Adapta el evento antes de responder: lo suyo ya es JSON, la reserva no. */
const aRespuesta = (evento) => ({
    ...evento,
    reserva: evento.reserva && reservaARespuesta(evento.reserva)
});

/**
 * Valida los campos del cuerpo y los devuelve ya normalizados. Si algo no cumple
 * devuelve `{ mensaje }` con el error a informar, para que crear y actualizar
 * apliquen exactamente las mismas reglas.
 *
 * `reservaId` no se valida acá a propósito: solo entra en el alta, porque mover
 * un evento de una reserva a otra no es una operación del negocio.
 */
const validarDatos = (body) => {
    const descripcion = normalizar(body.descripcion);
    const cantidadPersonas = Number(body.cantidadPersonas);
    const tipoEventoId = parseInt(body.tipoEventoId);

    if (!descripcion) {
        return { mensaje: 'La descripción es obligatoria' };
    }

    // Entero y mayor a cero: medio invitado no existe, y un evento de cero
    // personas no es un evento.
    if (!Number.isInteger(cantidadPersonas) || cantidadPersonas <= 0) {
        return { mensaje: 'La cantidad de personas debe ser un número entero mayor a cero' };
    }

    if (isNaN(tipoEventoId)) {
        return { mensaje: 'El tipo de evento es obligatorio' };
    }

    return { datos: { descripcion, cantidadPersonas, tipoEventoId } };
};

/**
 * Arma el filtro del listado a partir de los query params, con el mismo criterio
 * que el resto de los controllers.
 */
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

/**
 * Busca la reserva sobre la que va a colgar un evento nuevo y comprueba que el
 * solicitante pueda cargarlo. Devuelve `{ codigo, mensaje }` si no.
 */
const buscarReservaParaEvento = async (reservaId, solicitante) => {
    const reserva = await prisma.reserva.findUnique({
        where: {
            id: reservaId
        }
    });

    // La reserva llega en el cuerpo del request, así que un id inexistente es un
    // dato inválido del cliente (400) y no un recurso faltante en la URL (404).
    if (!reserva) {
        return { codigo: 400, mensaje: 'La reserva indicada no existe' };
    }

    if (!esAdmin(solicitante) && !esPropia(reserva, solicitante)) {
        return { codigo: 403, mensaje: 'La reserva es de otro usuario' };
    }

    // Una reserva cancelada no se va a jugar: cargarle un festejo no significa
    // nada.
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

        // Se pisa el filtro en vez de rechazar el pedido, igual que en reservas:
        // para el cliente el listado es siempre el de sus propias reservas.
        if (!esAdmin(req.usuario)) {
            filtro.reserva = {
                usuarioId: req.usuario.id
            };
        }

        // Mismo orden que el listado de reservas: los días más nuevos primero.
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

        // El índice único de `reservaId` ya lo impediría, pero llegar hasta la
        // base para enterarse deja un mensaje genérico: acá se explica cuál es el
        // problema. El catch de P2002 queda igual, para la carrera entre dos
        // pedidos simultáneos que pasan los dos por este chequeo.
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

        // A diferencia de la edición, borrar el evento de una reserva cancelada
        // sí se permite: es limpiar un dato que ya no aplica, no modificarlo.
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

// Además de los handlers se exportan las funciones puras del controller: no
// tocan la base ni el request, son las reglas del negocio en su forma más
// chica, y exportarlas es lo que permite cubrirlas con tests unitarios sin
// levantar el servidor.
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

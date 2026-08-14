const prisma = require('../config/prisma');

/** Formato de la fecha que entra y sale de la API: "AAAA-MM-DD". */
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Marca del error que se lanza dentro de la transacción cuando el turno ya
 * estaba ocupado. Se usa un centinela porque la única forma de abortar una
 * transacción de Prisma es lanzando, y afuera hay que distinguir este caso de
 * una falla real de la base.
 */
const TURNO_OCUPADO = 'TURNO_OCUPADO';

/** Estado con el que nace una reserva. Ver el comentario del enum en el schema. */
const ESTADO_INICIAL = 'CONFIRMADA';

/**
 * Pasa una hora "HH:mm" a minutos desde la medianoche, para poder restar dos
 * horas y saber cuánto dura el turno.
 */
const minutosDe = (hora) => {
    const [horas, minutos] = hora.split(':').map(Number);

    return horas * 60 + minutos;
};

/**
 * Saca `contrasena` del usuario incluido. No es opcional: ese campo guarda el
 * hash de bcrypt, y `usuario.controller.js` lo excluye en sus propias respuestas
 * pero no puede hacer nada por el usuario que viaja anidado en una reserva.
 */
const usuarioSinContrasena = (usuario) => {
    const { contrasena, ...resto } = usuario;

    return resto;
};

/**
 * Adapta la reserva antes de responder:
 *
 * - `fecha` se guarda como DATE y Prisma la devuelve a medianoche UTC, así que
 *   se recorta a "AAAA-MM-DD" para que el cliente reciba el mismo día.
 * - los `Decimal` viajan a JSON como string; se convierten a número acá.
 * - el usuario incluido pierde su contraseña.
 */
const aRespuesta = (reserva) => ({
    ...reserva,
    fecha: reserva.fecha.toISOString().slice(0, 10),
    precioTotal: Number(reserva.precioTotal),
    usuario: reserva.usuario && usuarioSinContrasena(reserva.usuario),
    cancha: reserva.cancha && {
        ...reserva.cancha,
        precioPorHora: Number(reserva.cancha.precioPorHora)
    },
    horario: reserva.horario && {
        ...reserva.horario,
        fecha: reserva.horario.fecha.toISOString().slice(0, 10)
    }
});

/** Relaciones que acompañan a la reserva en todas las respuestas. */
const RELACIONES = {
    usuario: true,
    cancha: true,
    horario: true
};

/**
 * Arma el filtro del listado a partir de los query params. Devuelve `{ mensaje }`
 * si alguno viene mal, con el mismo criterio que el resto de los controllers.
 */
const armarFiltro = (query) => {
    const filtro = {};

    for (const campo of ['usuarioId', 'canchaId']) {
        if (query[campo] === undefined) {
            continue;
        }

        const valor = parseInt(query[campo]);

        if (isNaN(valor)) {
            return { mensaje: `El valor de ${campo} debe ser un número` };
        }

        filtro[campo] = valor;
    }

    if (query.fecha !== undefined) {
        if (!FORMATO_FECHA.test(query.fecha)) {
            return { mensaje: 'La fecha debe tener el formato AAAA-MM-DD' };
        }

        filtro.fecha = new Date(query.fecha);
    }

    return { filtro };
};

const listarReservas = async (req, res) => {
    try {
        const { mensaje, filtro } = armarFiltro(req.query);

        if (mensaje) {
            return res.status(400).json({
                mensaje: mensaje
            });
        }

        // Las más nuevas primero: es el orden en el que se las mira desde la
        // administración del complejo.
        const reservas = await prisma.reserva.findMany({
            where: filtro,
            include: RELACIONES,
            orderBy: [
                { fecha: 'desc' },
                { horaInicio: 'asc' }
            ]
        });

        res.json(reservas.map(aRespuesta));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al listar las reservas'
        });
    }
};

/**
 * Crea la reserva de un turno.
 *
 * El cliente manda solamente el turno y el usuario: la fecha, las horas, la
 * cancha, el estado y el precio los deriva el backend del turno elegido. Un
 * precio que llega del navegador no se puede creer, y copiarlo del turno evita
 * que el cliente reserve un horario con los datos de otro.
 */
const crearReserva = async (req, res) => {
    try {
        const horarioId = parseInt(req.body.horarioId);
        const usuarioId = parseInt(req.body.usuarioId);

        if (isNaN(horarioId)) {
            return res.status(400).json({
                mensaje: 'El turno es obligatorio'
            });
        }

        if (isNaN(usuarioId)) {
            return res.status(400).json({
                mensaje: 'El usuario es obligatorio'
            });
        }

        const horario = await prisma.horario.findUnique({
            where: {
                id: horarioId
            },
            include: {
                cancha: true
            }
        });

        // El turno llega en el cuerpo del request, así que un id inexistente es
        // un dato inválido del cliente y no un recurso faltante en la URL.
        if (!horario) {
            return res.status(400).json({
                mensaje: 'El turno indicado no existe'
            });
        }

        const usuario = await prisma.usuario.findUnique({
            where: {
                id: usuarioId
            }
        });

        if (!usuario) {
            return res.status(400).json({
                mensaje: 'El usuario indicado no existe'
            });
        }

        if (!usuario.activo) {
            return res.status(400).json({
                mensaje: 'El usuario está dado de baja y no puede reservar'
            });
        }

        if (horario.cancha.estado === 'MANTENIMIENTO') {
            return res.status(409).json({
                mensaje: 'La cancha está en mantenimiento y no admite reservas'
            });
        }

        // El turno se guarda como día + "HH:mm" por separado, así que para
        // saber si ya pasó hay que rearmar el instante completo. Se compone en
        // hora local porque es la del complejo, que es contra la que el usuario
        // decide si el turno todavía sirve.
        const [anio, mes, dia] = horario.fecha.toISOString().slice(0, 10).split('-').map(Number);
        const [hora, minuto] = horario.horaInicio.split(':').map(Number);
        const comienzo = new Date(anio, mes - 1, dia, hora, minuto);

        if (comienzo.getTime() <= Date.now()) {
            return res.status(400).json({
                mensaje: 'No se puede reservar un turno que ya empezó'
            });
        }

        const horas = (minutosDe(horario.horaFin) - minutosDe(horario.horaInicio)) / 60;
        // Se redondea a dos decimales porque es lo que entra en el Decimal(10, 2)
        // de la base: sin esto, un turno de 90 minutos a un precio con centavos
        // dejaría que la base decidiera el redondeo.
        const precioTotal = Math.round(Number(horario.cancha.precioPorHora) * horas * 100) / 100;

        const reserva = await prisma.$transaction(async (tx) => {
            // Este `updateMany` es el candado contra la doble reserva: al filtrar
            // por `disponible: true` la base decide un único ganador aunque dos
            // pedidos lleguen a la vez. Si no actualizó ninguna fila, el turno ya
            // estaba tomado y la transacción se aborta sin crear la reserva.
            const ocupado = await tx.horario.updateMany({
                where: {
                    id: horarioId,
                    disponible: true
                },
                data: {
                    disponible: false
                }
            });

            if (ocupado.count === 0) {
                throw new Error(TURNO_OCUPADO);
            }

            return tx.reserva.create({
                data: {
                    fecha: horario.fecha,
                    horaInicio: horario.horaInicio,
                    horaFin: horario.horaFin,
                    estado: ESTADO_INICIAL,
                    precioTotal: precioTotal,
                    usuarioId: usuarioId,
                    canchaId: horario.canchaId,
                    horarioId: horarioId
                },
                include: RELACIONES
            });
        });

        res.status(201).json(aRespuesta(reserva));
    } catch (error) {
        if (error.message === TURNO_OCUPADO) {
            return res.status(409).json({
                mensaje: 'El turno ya fue reservado'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al crear la reserva'
        });
    }
};

const obtenerReserva = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        const reserva = await prisma.reserva.findUnique({
            where: {
                id: id
            },
            include: RELACIONES
        });

        if (!reserva) {
            return res.status(404).json({
                mensaje: 'Reserva no encontrada'
            });
        }

        res.json(aRespuesta(reserva));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al obtener la reserva'
        });
    }
};

module.exports = {
    listarReservas,
    crearReserva,
    obtenerReserva
};

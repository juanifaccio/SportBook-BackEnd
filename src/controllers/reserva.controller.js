const prisma = require('../config/prisma');
const ROLES = require('../config/roles');

/**
 * Una reserva es de quien la hizo. El administrador ve y gestiona todas —es el
 * mostrador del complejo—; el cliente, solo las suyas.
 *
 * Este control no puede vivir en las rutas como el del resto de los recursos:
 * ahí se sabe qué se está pidiendo, pero no de quién es la reserva que hay del
 * otro lado del `:id`.
 */
const esAdmin = (usuario) => usuario.rol.nombre === ROLES.ADMIN;

const esPropia = (reserva, usuario) => reserva.usuarioId === usuario.id;

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

/** Estado al que llega una reserva cancelada. */
const ESTADO_CANCELADA = 'CANCELADA';

/** Valores que acepta el enum `EstadoReserva`, para validar el filtro del listado. */
const ESTADOS = ['PENDIENTE', 'CONFIRMADA', 'CANCELADA'];

/**
 * Pasa una hora "HH:mm" a minutos desde la medianoche, para poder restar dos
 * horas y saber cuánto dura el turno.
 */
const minutosDe = (hora) => {
    const [horas, minutos] = hora.split(':').map(Number);

    return horas * 60 + minutos;
};

/**
 * Instante en el que arranca un turno.
 *
 * El día y la hora se guardan por separado (DATE + "HH:mm"), así que para saber
 * si el turno ya pasó hay que rearmarlo. Se compone en hora local porque es la
 * del complejo, que es contra la que el usuario decide si el turno todavía
 * sirve.
 */
const comienzoDe = (fecha, horaInicio) => {
    const [anio, mes, dia] = fecha.toISOString().slice(0, 10).split('-').map(Number);
    const [hora, minuto] = horaInicio.split(':').map(Number);

    return new Date(anio, mes - 1, dia, hora, minuto);
};

/** Un turno que ya arrancó no se puede reservar, ni reprogramar, ni cancelar. */
const yaEmpezo = (fecha, horaInicio) => comienzoDe(fecha, horaInicio).getTime() <= Date.now();

/**
 * Precio por hora de la cancha por la duración del turno.
 *
 * Se redondea a dos decimales porque es lo que entra en el Decimal(10, 2) de la
 * base: sin esto, un turno de 90 minutos a un precio con centavos dejaría que la
 * base decidiera el redondeo.
 */
const precioDe = (horario) => {
    const horas = (minutosDe(horario.horaFin) - minutosDe(horario.horaInicio)) / 60;

    return Math.round(Number(horario.cancha.precioPorHora) * horas * 100) / 100;
};

/**
 * Reglas que tiene que cumplir un turno para poder ocuparse, tanto al reservarlo
 * como al reprogramar una reserva hacia él. Devuelve `{ codigo, mensaje }` si
 * alguna no se cumple, para que las dos operaciones respondan lo mismo.
 */
const validarTurno = (horario) => {
    if (horario.cancha.estado === 'MANTENIMIENTO') {
        return {
            codigo: 409,
            mensaje: 'La cancha está en mantenimiento y no admite reservas'
        };
    }

    if (yaEmpezo(horario.fecha, horario.horaInicio)) {
        return {
            codigo: 400,
            mensaje: 'No se puede reservar un turno que ya empezó'
        };
    }

    return {};
};

/**
 * Datos que la reserva **copia** del turno. Son copia y no una lectura de la
 * relación a propósito (ver el comentario del modelo en el schema), así que al
 * reprogramar hay que volver a copiarlos todos: si solo se cambiara el
 * `horarioId`, la reserva quedaría mostrando el día y el precio del turno viejo.
 */
const datosDelTurno = (horario) => ({
    fecha: horario.fecha,
    horaInicio: horario.horaInicio,
    horaFin: horario.horaFin,
    canchaId: horario.canchaId,
    horarioId: horario.id,
    precioTotal: precioDe(horario)
});

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

/**
 * Relaciones que acompañan a la reserva en todas las respuestas. La cancha viaja
 * con su tipo porque el detalle de una reserva lo muestra, y pedirlo aparte
 * sería una consulta más por cada reserva que se abre.
 */
const RELACIONES = {
    usuario: true,
    cancha: {
        include: {
            tipoCancha: true
        }
    },
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

    if (query.estado !== undefined) {
        if (!ESTADOS.includes(query.estado)) {
            return { mensaje: `El estado debe ser ${ESTADOS.join(', ')}` };
        }

        filtro.estado = query.estado;
    }

    return { filtro };
};

/**
 * Busca la reserva de la URL y comprueba que se la pueda modificar. Devuelve
 * `{ codigo, mensaje }` si no, para que reprogramar y cancelar apliquen las
 * mismas reglas.
 */
const buscarReservaModificable = async (idCrudo, solicitante) => {
    const id = parseInt(idCrudo);

    if (isNaN(id)) {
        return { codigo: 400, mensaje: 'El id debe ser un número' };
    }

    const reserva = await prisma.reserva.findUnique({
        where: {
            id: id
        }
    });

    if (!reserva) {
        return { codigo: 404, mensaje: 'Reserva no encontrada' };
    }

    // Antes que cualquier regla del negocio: si la reserva no es suya, al
    // cliente ni siquiera le corresponde enterarse de en qué estado está.
    if (!esAdmin(solicitante) && !esPropia(reserva, solicitante)) {
        return { codigo: 403, mensaje: 'La reserva es de otro usuario' };
    }

    if (reserva.estado === ESTADO_CANCELADA) {
        return { codigo: 409, mensaje: 'La reserva ya está cancelada' };
    }

    // Una reserva que ya arrancó es historia: cancelarla liberaría un turno que
    // no le sirve a nadie, y reprogramarla reescribiría lo que efectivamente
    // pasó.
    if (yaEmpezo(reserva.fecha, reserva.horaInicio)) {
        return { codigo: 400, mensaje: 'La reserva ya empezó y no se puede modificar' };
    }

    return { reserva };
};

const listarReservas = async (req, res) => {
    try {
        const { mensaje, filtro } = armarFiltro(req.query);

        if (mensaje) {
            return res.status(400).json({
                mensaje: mensaje
            });
        }

        // Se pisa el filtro en vez de rechazar el pedido: `?usuarioId=` es un
        // filtro del listado de administración, y para el cliente el listado es
        // siempre el suyo. Como va después de `armarFiltro`, mandar el id de
        // otro usuario en la query no cambia nada.
        if (!esAdmin(req.usuario)) {
            filtro.usuarioId = req.usuario.id;
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
 * El cliente manda solamente el turno: la fecha, las horas, la cancha, el estado
 * y el precio los deriva el backend del turno elegido. Un precio que llega del
 * navegador no se puede creer, y copiarlo del turno evita que el cliente reserve
 * un horario con los datos de otro.
 *
 * El dueño de la reserva sale de la sesión, no del cuerpo: si viniera del
 * cliente, cualquiera podría reservar a nombre de otro. La excepción es el
 * administrador, que reserva desde el mostrador para quien se lo pide, y por eso
 * es el único que puede mandar `usuarioId`.
 */
const crearReserva = async (req, res) => {
    try {
        const horarioId = parseInt(req.body.horarioId);
        const usuarioId = esAdmin(req.usuario) ? parseInt(req.body.usuarioId) : req.usuario.id;

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

        const turnoInvalido = validarTurno(horario);

        if (turnoInvalido.mensaje) {
            return res.status(turnoInvalido.codigo).json({
                mensaje: turnoInvalido.mensaje
            });
        }

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
                    ...datosDelTurno(horario),
                    estado: ESTADO_INICIAL,
                    usuarioId: usuarioId
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

        if (!esAdmin(req.usuario) && !esPropia(reserva, req.usuario)) {
            return res.status(403).json({
                mensaje: 'La reserva es de otro usuario'
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

/**
 * Reprograma una reserva a otro turno.
 *
 * Es lo único que se puede modificar de una reserva, así que el cuerpo trae solo
 * `horarioId`: la fecha, las horas, la cancha y el precio se vuelven a copiar del
 * turno nuevo, igual que en el alta.
 */
const actualizarReserva = async (req, res) => {
    try {
        const { codigo, mensaje, reserva } = await buscarReservaModificable(req.params.id, req.usuario);

        if (mensaje) {
            return res.status(codigo).json({
                mensaje: mensaje
            });
        }

        const horarioId = parseInt(req.body.horarioId);

        if (isNaN(horarioId)) {
            return res.status(400).json({
                mensaje: 'El turno es obligatorio'
            });
        }

        // Sin esto, reprogramar al mismo turno liberaría el turno viejo —que es
        // el mismo— después de haberlo tomado, y la reserva quedaría ocupando un
        // turno marcado como libre.
        if (horarioId === reserva.horarioId) {
            return res.status(400).json({
                mensaje: 'La reserva ya está en ese turno'
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

        const turnoInvalido = validarTurno(horario);

        if (turnoInvalido.mensaje) {
            return res.status(turnoInvalido.codigo).json({
                mensaje: turnoInvalido.mensaje
            });
        }

        const actualizada = await prisma.$transaction(async (tx) => {
            // Se toma el turno nuevo con el mismo candado que usa el alta, y
            // recién después se libera el viejo: si alguien se adelantó, la
            // transacción se aborta y la reserva se queda donde estaba.
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

            await tx.horario.update({
                where: {
                    id: reserva.horarioId
                },
                data: {
                    disponible: true
                }
            });

            return tx.reserva.update({
                where: {
                    id: reserva.id
                },
                data: datosDelTurno(horario),
                include: RELACIONES
            });
        });

        res.json(aRespuesta(actualizada));
    } catch (error) {
        if (error.message === TURNO_OCUPADO) {
            return res.status(409).json({
                mensaje: 'El turno ya fue reservado'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al actualizar la reserva'
        });
    }
};

/**
 * Cancela una reserva y devuelve su turno a la lista de libres.
 *
 * La fila no se borra: una cancelación es un hecho del negocio y la reserva
 * queda como historial. Las dos operaciones van en una transacción porque una
 * reserva cancelada con el turno todavía ocupado dejaría ese turno perdido para
 * siempre.
 *
 * No hace falta el candado del alta: mientras la reserva está activa su turno
 * está en `disponible: false`, así que nadie más lo tiene.
 */
const cancelarReserva = async (req, res) => {
    try {
        const { codigo, mensaje, reserva } = await buscarReservaModificable(req.params.id, req.usuario);

        if (mensaje) {
            return res.status(codigo).json({
                mensaje: mensaje
            });
        }

        const cancelada = await prisma.$transaction(async (tx) => {
            await tx.horario.update({
                where: {
                    id: reserva.horarioId
                },
                data: {
                    disponible: true
                }
            });

            return tx.reserva.update({
                where: {
                    id: reserva.id
                },
                data: {
                    estado: ESTADO_CANCELADA
                },
                include: RELACIONES
            });
        });

        res.json(aRespuesta(cancelada));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al cancelar la reserva'
        });
    }
};

module.exports = {
    listarReservas,
    crearReserva,
    obtenerReserva,
    actualizarReserva,
    cancelarReserva
};

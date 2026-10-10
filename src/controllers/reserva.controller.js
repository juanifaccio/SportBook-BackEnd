const prisma = require('../config/prisma');
const ROLES = require('../config/roles');

const esAdmin = (usuario) => usuario.rol.nombre === ROLES.ADMIN;

const esPropia = (reserva, usuario) => reserva.usuarioId === usuario.id;

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const TURNO_OCUPADO = 'TURNO_OCUPADO';

const EQUIPAMIENTO_INVALIDO = 'EQUIPAMIENTO_INVALIDO';

const CODIGO_CONFLICTO = 'P2034';

const OPCIONES_CON_EQUIPAMIENTO = { isolationLevel: 'Serializable' };

const ESTADO_INICIAL = 'PENDIENTE';

const ESTADO_CONFIRMADA = 'CONFIRMADA';

const ESTADO_CANCELADA = 'CANCELADA';

const PAGO_ANULADO = 'ANULADO';

const ESTADOS = ['PENDIENTE', 'CONFIRMADA', 'CANCELADA'];

const minutosDe = (hora) => {
    const [horas, minutos] = hora.split(':').map(Number);

    return horas * 60 + minutos;
};

const comienzoDe = (fecha, horaInicio) => {
    const [anio, mes, dia] = fecha.toISOString().slice(0, 10).split('-').map(Number);
    const [hora, minuto] = horaInicio.split(':').map(Number);

    return new Date(anio, mes - 1, dia, hora, minuto);
};

const yaEmpezo = (fecha, horaInicio) => comienzoDe(fecha, horaInicio).getTime() <= Date.now();

const precioDe = (horario) => {
    const horas = (minutosDe(horario.horaFin) - minutosDe(horario.horaInicio)) / 60;

    return Math.round(Number(horario.cancha.precioPorHora) * horas * 100) / 100;
};

const sumarImportes = (a, b) => Math.round((Number(a) + Number(b)) * 100) / 100;

const subtotalDe = (precio, cantidad) => Math.round(Number(precio) * cantidad * 100) / 100;

const validarEquipamientos = (lista) => {
    if (lista === undefined || lista === null) {
        return { items: [] };
    }

    if (!Array.isArray(lista)) {
        return { mensaje: 'El equipamiento debe ser una lista' };
    }

    const items = [];

    for (const pedido of lista) {
        const equipamientoId = Number(pedido?.equipamientoId);
        const cantidad = Number(pedido?.cantidad);

        if (!Number.isInteger(equipamientoId)) {
            return { mensaje: 'Cada artículo debe indicar un equipamiento' };
        }

        if (!Number.isInteger(cantidad) || cantidad < 1) {
            return { mensaje: 'La cantidad de cada artículo debe ser un número entero mayor a cero' };
        }

        if (items.some((item) => item.equipamientoId === equipamientoId)) {
            return { mensaje: 'Un artículo no puede aparecer dos veces en la misma reserva' };
        }

        items.push({ equipamientoId, cantidad });
    }

    return { items };
};

const sumarAlquilado = (filas) => {
    const alquilado = new Map();

    for (const fila of filas) {
        alquilado.set(fila.equipamientoId, (alquilado.get(fila.equipamientoId) ?? 0) + fila.cantidad);
    }

    return alquilado;
};

const disponiblesDe = (equipamiento, alquilado) =>
    Math.max(0, equipamiento.stock - (alquilado.get(equipamiento.id) ?? 0));

const armarEquipamientos = (items, equipamientos, alquilado) => {
    const filas = [];
    let total = 0;

    for (const item of items) {
        const equipamiento = equipamientos.find((candidato) => candidato.id === item.equipamientoId);

        if (!equipamiento) {
            return { codigo: 400, mensaje: 'El equipamiento indicado no existe' };
        }

        if (disponiblesDe(equipamiento, alquilado) < item.cantidad) {
            return {
                codigo: 409,
                mensaje: `No quedan suficientes unidades de ${equipamiento.nombre} para ese turno`
            };
        }

        const subtotal = subtotalDe(equipamiento.precio, item.cantidad);

        filas.push({ equipamientoId: item.equipamientoId, cantidad: item.cantidad, subtotal });
        total = sumarImportes(total, subtotal);
    }

    return { filas, total };
};

const alquiladoEnTurno = async (db, turno, equipamientoIds, reservaIdExcluida) => {
    const filas = await db.reservaEquipamiento.findMany({
        where: {
            ...(equipamientoIds ? { equipamientoId: { in: equipamientoIds } } : {}),
            reserva: {
                estado: {
                    not: ESTADO_CANCELADA
                },
                fecha: turno.fecha,
                horaInicio: {
                    lt: turno.horaFin
                },
                horaFin: {
                    gt: turno.horaInicio
                },
                ...(reservaIdExcluida ? { id: { not: reservaIdExcluida } } : {})
            }
        },
        select: {
            equipamientoId: true,
            cantidad: true
        }
    });

    return sumarAlquilado(filas);
};

const reservarEquipamiento = async (tx, turno, items, reservaIdExcluida) => {
    if (items.length === 0) {
        return { filas: [], total: 0 };
    }

    const ids = items.map((item) => item.equipamientoId);

    const equipamientos = await tx.equipamiento.findMany({
        where: {
            id: {
                in: ids
            }
        }
    });

    const alquilado = await alquiladoEnTurno(tx, turno, ids, reservaIdExcluida);
    const resultado = armarEquipamientos(items, equipamientos, alquilado);

    if (resultado.mensaje) {
        const error = new Error(EQUIPAMIENTO_INVALIDO);

        error.respuesta = { codigo: resultado.codigo, mensaje: resultado.mensaje };

        throw error;
    }

    return resultado;
};

const responderErrorDeTransaccion = (error, res) => {
    if (error.message === TURNO_OCUPADO) {
        res.status(409).json({
            mensaje: 'El turno ya fue reservado'
        });

        return true;
    }

    if (error.message === EQUIPAMIENTO_INVALIDO) {
        res.status(error.respuesta.codigo).json({
            mensaje: error.respuesta.mensaje
        });

        return true;
    }

    if (error.code === CODIGO_CONFLICTO) {
        res.status(409).json({
            mensaje: 'El equipamiento se acaba de reservar para ese horario, probá de nuevo'
        });

        return true;
    }

    return false;
};

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

const datosDelTurno = (horario) => ({
    fecha: horario.fecha,
    horaInicio: horario.horaInicio,
    horaFin: horario.horaFin,
    canchaId: horario.canchaId,
    horarioId: horario.id,
    precioTotal: precioDe(horario)
});

const usuarioSinContrasena = (usuario) => {
    const { contrasena, ...resto } = usuario;

    return resto;
};

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
    },
    pagos: reserva.pagos?.map((pago) => ({
        ...pago,
        monto: Number(pago.monto),
        fecha: pago.fecha.toISOString().slice(0, 10)
    })),
    equipamientos: reserva.equipamientos?.map((fila) => ({
        ...fila,
        subtotal: Number(fila.subtotal),
        equipamiento: fila.equipamiento && {
            ...fila.equipamiento,
            precio: Number(fila.equipamiento.precio)
        }
    }))
});

const RELACIONES = {
    usuario: true,
    cancha: {
        include: {
            tipoCancha: true
        }
    },
    horario: true,
    evento: {
        include: {
            tipoEvento: true
        }
    },
    pagos: true,
    equipamientos: {
        include: {
            equipamiento: true
        }
    }
};

const saldoDe = (precioTotal, pagos = []) => {
    const pagado = pagos
        .filter((pago) => pago.estado !== PAGO_ANULADO)
        .reduce((total, pago) => total + Number(pago.monto), 0);

    return Number(precioTotal) - pagado;
};

const estadoSegunPagos = (reserva, pagos) => {
    if (reserva.estado === ESTADO_CANCELADA) {
        return ESTADO_CANCELADA;
    }

    return saldoDe(reserva.precioTotal, pagos) <= 0 ? ESTADO_CONFIRMADA : ESTADO_INICIAL;
};

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

const buscarReservaModificable = async (idCrudo, solicitante) => {
    const id = parseInt(idCrudo);

    if (isNaN(id)) {
        return { codigo: 400, mensaje: 'El id debe ser un número' };
    }

    const reserva = await prisma.reserva.findUnique({
        where: {
            id: id
        },
        include: {
            equipamientos: true
        }
    });

    if (!reserva) {
        return { codigo: 404, mensaje: 'Reserva no encontrada' };
    }

    if (!esAdmin(solicitante) && !esPropia(reserva, solicitante)) {
        return { codigo: 403, mensaje: 'La reserva es de otro usuario' };
    }

    if (reserva.estado === ESTADO_CANCELADA) {
        return { codigo: 409, mensaje: 'La reserva ya está cancelada' };
    }

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

        if (!esAdmin(req.usuario)) {
            filtro.usuarioId = req.usuario.id;
        }

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

        const { mensaje: equipamientoInvalido, items } = validarEquipamientos(req.body.equipamientos);

        if (equipamientoInvalido) {
            return res.status(400).json({
                mensaje: equipamientoInvalido
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

            const equipamiento = await reservarEquipamiento(tx, horario, items);
            const datos = datosDelTurno(horario);

            return tx.reserva.create({
                data: {
                    ...datos,
                    precioTotal: sumarImportes(datos.precioTotal, equipamiento.total),
                    estado: ESTADO_INICIAL,
                    usuarioId: usuarioId,
                    equipamientos: {
                        create: equipamiento.filas
                    }
                },
                include: RELACIONES
            });
        }, items.length > 0 ? OPCIONES_CON_EQUIPAMIENTO : undefined);

        res.status(201).json(aRespuesta(reserva));
    } catch (error) {
        if (responderErrorDeTransaccion(error, res)) {
            return;
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

            await reservarEquipamiento(
                tx,
                horario,
                reserva.equipamientos.map(({ equipamientoId, cantidad }) => ({ equipamientoId, cantidad })),
                reserva.id
            );

            const datos = datosDelTurno(horario);
            const totalEquipamiento = reserva.equipamientos.reduce(
                (total, fila) => sumarImportes(total, fila.subtotal),
                0
            );

            const conNuevoTurno = await tx.reserva.update({
                where: {
                    id: reserva.id
                },
                data: {
                    ...datos,
                    precioTotal: sumarImportes(datos.precioTotal, totalEquipamiento)
                },
                include: RELACIONES
            });

            const estado = estadoSegunPagos(conNuevoTurno, conNuevoTurno.pagos);

            if (estado === conNuevoTurno.estado) {
                return conNuevoTurno;
            }

            return tx.reserva.update({
                where: {
                    id: reserva.id
                },
                data: {
                    estado: estado
                },
                include: RELACIONES
            });
        }, reserva.equipamientos.length > 0 ? OPCIONES_CON_EQUIPAMIENTO : undefined);

        res.json(aRespuesta(actualizada));
    } catch (error) {
        if (responderErrorDeTransaccion(error, res)) {
            return;
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al actualizar la reserva'
        });
    }
};

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
    cancelarReserva,
    minutosDe,
    precioDe,
    yaEmpezo,
    validarTurno,
    datosDelTurno,
    armarFiltro,
    saldoDe,
    estadoSegunPagos,
    aRespuesta,
    subtotalDe,
    sumarImportes,
    validarEquipamientos,
    sumarAlquilado,
    disponiblesDe,
    armarEquipamientos,
    alquiladoEnTurno
};

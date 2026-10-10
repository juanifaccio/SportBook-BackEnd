const prisma = require('../config/prisma');

const CODIGO_DUPLICADO = 'P2002';

const CODIGO_CLAVE_FORANEA = 'P2003';

const CODIGO_CONFLICTO = 'P2034';

const TURNO_RESERVADO = 'TURNO_RESERVADO';

const ESTADO_CANCELADA = 'CANCELADA';

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const normalizar = (texto) => (typeof texto === 'string' ? texto.trim() : '');

const aRespuesta = (horario) => ({
    ...horario,
    fecha: horario.fecha.toISOString().slice(0, 10),
    cancha: horario.cancha && {
        ...horario.cancha,
        precioPorHora: Number(horario.cancha.precioPorHora)
    }
});

const validarDatos = (body) => {
    const fecha = normalizar(body.fecha);
    const horaInicio = normalizar(body.horaInicio);
    const horaFin = normalizar(body.horaFin);
    const canchaId = parseInt(body.canchaId);

    const fechaParseada = new Date(fecha);

    if (
        !FORMATO_FECHA.test(fecha) ||
        isNaN(fechaParseada.getTime()) ||
        fechaParseada.toISOString().slice(0, 10) !== fecha
    ) {
        return { mensaje: 'La fecha es obligatoria y debe tener el formato AAAA-MM-DD' };
    }

    if (!FORMATO_HORA.test(horaInicio) || !FORMATO_HORA.test(horaFin)) {
        return { mensaje: 'Las horas son obligatorias y deben tener el formato HH:mm' };
    }

    if (horaFin <= horaInicio) {
        return { mensaje: 'La hora de fin debe ser posterior a la de inicio' };
    }

    if (isNaN(canchaId)) {
        return { mensaje: 'La cancha es obligatoria' };
    }

    if (body.disponible !== undefined && typeof body.disponible !== 'boolean') {
        return { mensaje: 'El campo disponible debe ser verdadero o falso' };
    }

    return {
        datos: {
            fecha: fechaParseada,
            horaInicio,
            horaFin,
            canchaId,
            disponible: body.disponible === undefined ? true : body.disponible
        }
    };
};

const buscarSolapado = async (datos, idAExcluir) => {
    return prisma.horario.findFirst({
        where: {
            canchaId: datos.canchaId,
            fecha: datos.fecha,
            horaInicio: {
                lt: datos.horaFin
            },
            horaFin: {
                gt: datos.horaInicio
            },
            id: {
                not: idAExcluir
            }
        }
    });
};

const validarCambioConReserva = (anterior, datos) => {
    const loMueve =
        anterior.fecha.getTime() !== datos.fecha.getTime() ||
        anterior.horaInicio !== datos.horaInicio ||
        anterior.horaFin !== datos.horaFin ||
        anterior.canchaId !== datos.canchaId;

    if (loMueve) {
        return {
            mensaje: 'El horario tiene una reserva activa y no se puede cambiar de día, de hora ni de cancha'
        };
    }

    if (datos.disponible) {
        return {
            mensaje: 'El horario tiene una reserva activa y no se puede volver a ofrecer: para liberarlo, cancelá la reserva'
        };
    }

    return {};
};

const DURACION_MINIMA = 15;
const DURACION_MAXIMA = 480;

const aMinutos = (hora) => {
    const [horas, minutos] = hora.split(':').map(Number);

    return horas * 60 + minutos;
};

const aTextoHora = (minutos) => {
    const horas = `${Math.floor(minutos / 60)}`.padStart(2, '0');

    return `${horas}:${`${minutos % 60}`.padStart(2, '0')}`;
};

const generarTurnos = (horaInicio, horaFin, duracion) => {
    const fin = aMinutos(horaFin);
    const turnos = [];

    for (let desde = aMinutos(horaInicio); desde + duracion <= fin; desde += duracion) {
        turnos.push({
            horaInicio: aTextoHora(desde),
            horaFin: aTextoHora(desde + duracion)
        });
    }

    return turnos;
};

const seSolapan = (uno, otro) => uno.horaInicio < otro.horaFin && uno.horaFin > otro.horaInicio;

const validarLote = (body) => {
    const { mensaje, datos } = validarDatos(body);

    if (mensaje) {
        return { mensaje: mensaje };
    }

    const duracion = parseInt(body.duracion);

    if (isNaN(duracion) || duracion < DURACION_MINIMA || duracion > DURACION_MAXIMA) {
        return {
            mensaje: `La duración del turno es obligatoria y debe estar entre ${DURACION_MINIMA} y ${DURACION_MAXIMA} minutos`
        };
    }

    const turnos = generarTurnos(datos.horaInicio, datos.horaFin, duracion);

    if (turnos.length === 0) {
        return { mensaje: 'El rango horario es más corto que la duración del turno' };
    }

    return {
        datos: {
            canchaId: datos.canchaId,
            fecha: datos.fecha,
            turnos: turnos
        }
    };
};

const listarHorarios = async (req, res) => {
    try {
        const filtro = {};

        if (req.query.canchaId !== undefined) {
            const canchaId = parseInt(req.query.canchaId);

            if (isNaN(canchaId)) {
                return res.status(400).json({
                    mensaje: 'El id de la cancha debe ser un número'
                });
            }

            filtro.canchaId = canchaId;
        }

        if (req.query.fecha !== undefined) {
            if (!FORMATO_FECHA.test(req.query.fecha)) {
                return res.status(400).json({
                    mensaje: 'La fecha debe tener el formato AAAA-MM-DD'
                });
            }

            filtro.fecha = new Date(req.query.fecha);
        }

        if (req.query.disponible !== undefined) {
            if (req.query.disponible !== 'true' && req.query.disponible !== 'false') {
                return res.status(400).json({
                    mensaje: 'El filtro disponible debe ser true o false'
                });
            }

            filtro.disponible = req.query.disponible === 'true';
        }

        const horarios = await prisma.horario.findMany({
            where: filtro,
            include: {
                cancha: true
            },
            orderBy: [
                { fecha: 'asc' },
                { horaInicio: 'asc' }
            ]
        });

        res.json(horarios.map(aRespuesta));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al listar los horarios'
        });
    }
};

const crearHorario = async (req, res) => {
    try {
        const { mensaje, datos } = validarDatos(req.body);

        if (mensaje) {
            return res.status(400).json({
                mensaje: mensaje
            });
        }

        const cancha = await prisma.cancha.findUnique({
            where: {
                id: datos.canchaId
            }
        });

        if (!cancha) {
            return res.status(400).json({
                mensaje: 'La cancha indicada no existe'
            });
        }

        const solapado = await buscarSolapado(datos, 0);

        if (solapado) {
            return res.status(409).json({
                mensaje: 'La cancha ya tiene un horario que se superpone con ese'
            });
        }

        const horario = await prisma.horario.create({
            data: datos,
            include: {
                cancha: true
            }
        });

        res.status(201).json(aRespuesta(horario));
    } catch (error) {
        if (error.code === CODIGO_DUPLICADO) {
            return res.status(409).json({
                mensaje: 'La cancha ya tiene un horario que empieza a esa hora ese día'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al crear el horario'
        });
    }
};

const generarHorarios = async (req, res) => {
    try {
        const { mensaje, datos } = validarLote(req.body);

        if (mensaje) {
            return res.status(400).json({
                mensaje: mensaje
            });
        }

        const cancha = await prisma.cancha.findUnique({
            where: {
                id: datos.canchaId
            }
        });

        if (!cancha) {
            return res.status(400).json({
                mensaje: 'La cancha indicada no existe'
            });
        }

        const existentes = await prisma.horario.findMany({
            where: {
                canchaId: datos.canchaId,
                fecha: datos.fecha
            },
            select: {
                horaInicio: true,
                horaFin: true
            }
        });

        const aCrear = datos.turnos.filter(
            (turno) => !existentes.some((existente) => seSolapan(turno, existente))
        );

        if (aCrear.length === 0) {
            return res.status(409).json({
                mensaje: 'Todos los turnos de ese rango ya estaban cargados'
            });
        }

        const creados = await prisma.$transaction(
            aCrear.map((turno) =>
                prisma.horario.create({
                    data: {
                        ...turno,
                        fecha: datos.fecha,
                        canchaId: datos.canchaId
                    },
                    include: {
                        cancha: true
                    }
                })
            )
        );

        res.status(201).json({
            creados: creados.map(aRespuesta),
            omitidos: datos.turnos.length - aCrear.length
        });
    } catch (error) {
        if (error.code === CODIGO_DUPLICADO) {
            return res.status(409).json({
                mensaje: 'La cancha ya tiene un horario que empieza a esa hora ese día'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al generar los horarios'
        });
    }
};

const obtenerHorario = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        const horario = await prisma.horario.findUnique({
            where: {
                id: id
            },
            include: {
                cancha: true
            }
        });

        if (!horario) {
            return res.status(404).json({
                mensaje: 'Horario no encontrado'
            });
        }

        res.json(aRespuesta(horario));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al obtener el horario'
        });
    }
};

const actualizarHorario = async (req, res) => {
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

        const horarioExistente = await prisma.horario.findUnique({
            where: {
                id: id
            }
        });

        if (!horarioExistente) {
            return res.status(404).json({
                mensaje: 'Horario no encontrado'
            });
        }

        const cancha = await prisma.cancha.findUnique({
            where: {
                id: datos.canchaId
            }
        });

        if (!cancha) {
            return res.status(400).json({
                mensaje: 'La cancha indicada no existe'
            });
        }

        const solapado = await buscarSolapado(datos, id);

        if (solapado) {
            return res.status(409).json({
                mensaje: 'La cancha ya tiene un horario que se superpone con ese'
            });
        }

        const horario = await prisma.$transaction(
            async (tx) => {
                const reservaActiva = await tx.reserva.findFirst({
                    where: {
                        horarioId: id,
                        estado: {
                            not: ESTADO_CANCELADA
                        }
                    }
                });

                if (reservaActiva) {
                    const { mensaje: motivo } = validarCambioConReserva(horarioExistente, datos);

                    if (motivo) {
                        throw Object.assign(new Error(TURNO_RESERVADO), { mensaje: motivo });
                    }
                }

                return tx.horario.update({
                    where: {
                        id: id
                    },
                    data: datos,
                    include: {
                        cancha: true
                    }
                });
            },
            { isolationLevel: 'Serializable' }
        );

        res.json(aRespuesta(horario));
    } catch (error) {
        if (error.message === TURNO_RESERVADO) {
            return res.status(409).json({
                mensaje: error.mensaje
            });
        }

        if (error.code === CODIGO_CONFLICTO) {
            return res.status(409).json({
                mensaje: 'El horario se acaba de reservar, probá de nuevo'
            });
        }

        if (error.code === CODIGO_DUPLICADO) {
            return res.status(409).json({
                mensaje: 'La cancha ya tiene un horario que empieza a esa hora ese día'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al actualizar el horario'
        });
    }
};

const eliminarHorario = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        const horarioExistente = await prisma.horario.findUnique({
            where: {
                id: id
            }
        });

        if (!horarioExistente) {
            return res.status(404).json({
                mensaje: 'Horario no encontrado'
            });
        }

        await prisma.horario.delete({
            where: {
                id: id
            }
        });

        res.json({
            mensaje: 'Horario eliminado correctamente'
        });
    } catch (error) {
        if (error.code === CODIGO_CLAVE_FORANEA) {
            return res.status(409).json({
                mensaje: 'No se puede eliminar el horario porque tiene reservas asociadas'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al eliminar el horario'
        });
    }
};

module.exports = {
    listarHorarios,
    crearHorario,
    generarHorarios,
    obtenerHorario,
    actualizarHorario,
    eliminarHorario,
    validarDatos,
    validarLote,
    validarCambioConReserva,
    generarTurnos,
    seSolapan,
    aRespuesta
};

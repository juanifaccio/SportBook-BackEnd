const prisma = require('../config/prisma');

/** Código con el que Prisma reporta la violación de un índice único. */
const CODIGO_DUPLICADO = 'P2002';

/** Formato de la fecha que entra y sale de la API: "AAAA-MM-DD". */
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Formato de las horas que entran y salen de la API: "HH:mm". */
const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const normalizar = (texto) => (typeof texto === 'string' ? texto.trim() : '');

/**
 * La fecha se guarda como DATE y Prisma la devuelve como un DateTime a medianoche
 * UTC. Se recorta a "AAAA-MM-DD" para que el cliente reciba el mismo día que
 * mandó, sin que el huso horario lo corra al anterior.
 */
const aRespuesta = (horario) => ({
    ...horario,
    fecha: horario.fecha.toISOString().slice(0, 10),
    // La cancha incluida trae su precio como Decimal, que viaja a JSON como
    // string: se convierte acá para que salga igual que en /api/canchas.
    cancha: horario.cancha && {
        ...horario.cancha,
        precioPorHora: Number(horario.cancha.precioPorHora)
    }
});

/**
 * Valida los campos del cuerpo y los devuelve ya normalizados. Si algo no cumple
 * devuelve `{ mensaje }` con el error a informar, para que crear y actualizar
 * apliquen exactamente las mismas reglas.
 */
const validarDatos = (body) => {
    const fecha = normalizar(body.fecha);
    const horaInicio = normalizar(body.horaInicio);
    const horaFin = normalizar(body.horaFin);
    const canchaId = parseInt(body.canchaId);

    // No alcanza con el formato ni con que la fecha no sea inválida: un
    // "2026-02-31" no falla, `Date` lo corre al 3 de marzo. La única forma de
    // detectarlo es comprobar que al volver a texto siga siendo el mismo día.
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

    // Las horas están en formato de 24 horas con dos dígitos, así que compararlas
    // como texto da el mismo orden que compararlas como hora.
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

/**
 * Busca un turno de la misma cancha y el mismo día que se pise con el que se
 * quiere guardar. Dos turnos se solapan cuando cada uno empieza antes de que
 * termine el otro. Al editar hay que excluir el propio turno, que obviamente se
 * solapa consigo mismo.
 */
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

/**
 * Duración mínima y máxima de un turno generado, en minutos. El piso es el turno
 * más corto que tiene sentido ofrecer y el techo, media jornada: no son límites
 * del negocio sino un cerco para que un número absurdo no genere una grilla que
 * nadie pidió.
 */
const DURACION_MINIMA = 15;
const DURACION_MAXIMA = 480;

/** Pasa una hora "HH:mm" a los minutos transcurridos desde la medianoche. */
const aMinutos = (hora) => {
    const [horas, minutos] = hora.split(':').map(Number);

    return horas * 60 + minutos;
};

/** La vuelta de `aMinutos`: los minutos desde la medianoche, como "HH:mm". */
const aTextoHora = (minutos) => {
    const horas = `${Math.floor(minutos / 60)}`.padStart(2, '0');

    return `${horas}:${`${minutos % 60}`.padStart(2, '0')}`;
};

/**
 * Parte un rango horario en turnos consecutivos de `duracion` minutos.
 *
 * El último turno se descarta si no entra completo: si el rango no es múltiplo
 * de la duración —de 08:00 a 13:00 en turnos de 90 minutos—, estirarlo pasaría
 * del horario que pidió el administrador y recortarlo dejaría a la venta un
 * turno más corto que los demás al mismo precio por hora.
 */
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

/**
 * Dos turnos se pisan cuando cada uno empieza antes de que termine el otro.
 *
 * Es la misma pregunta que le hace `buscarSolapado` a la base, pero contestada
 * en memoria: el lote la repite una vez por turno generado y siempre contra el
 * mismo día de la misma cancha, así que traer esos turnos una sola vez sale más
 * barato que una consulta por cada uno.
 */
const seSolapan = (uno, otro) => uno.horaInicio < otro.horaFin && uno.horaFin > otro.horaInicio;

/**
 * Valida el cuerpo de la generación en lote y devuelve los turnos que hay que
 * crear.
 *
 * La cancha, el día y el rango se validan con `validarDatos`, que es la misma
 * regla que aplica un turno suelto: son exactamente los mismos campos. Lo único
 * propio del lote es la duración.
 */
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

    // Un rango de 10:00 a 11:00 en turnos de 90 minutos no da ninguno. No es un
    // lote vacío sino un rango mal cargado, así que se avisa en vez de crear
    // nada y responder que salió todo bien.
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
        // El listado se consulta siempre por cancha: son los turnos de una cancha
        // concreta, no un catálogo global. La fecha y la disponibilidad se suman
        // para la pantalla de reservar, que necesita los turnos libres de un día.
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

        // La cancha llega en el cuerpo del request, así que un id inexistente es
        // un dato inválido del cliente y no un recurso faltante en la URL.
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

/**
 * Genera de una vez todos los turnos de un día para una cancha.
 *
 * Es la misma alta de siempre repetida: llenar un día de a un turno son doce
 * formularios idénticos salvo por la hora. Los turnos que se pisen con alguno ya
 * cargado se saltean en vez de hacer fallar el lote entero, que es lo que
 * permite ampliar una grilla ya empezada sin tener que mirar antes cuál falta.
 */
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

        // Que no quede nada por crear no es un lote vacío del que informar: el
        // administrador pidió turnos y no se generó ninguno, igual que cuando un
        // alta suelta se pisa con otro turno.
        if (aCrear.length === 0) {
            return res.status(409).json({
                mensaje: 'Todos los turnos de ese rango ya estaban cargados'
            });
        }

        // Todo o nada: un lote a medias dejaría al administrador sin saber qué
        // quedó cargado y qué no. El índice único de (cancha, día, hora de
        // inicio) es el que ataja el turno que se cuele entre la lectura de
        // arriba y esta escritura.
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

        // Los salteados van en el número y no en la lista: lo que el
        // administrador necesita saber es cuántos de los que pidió ya estaban, y
        // cuáles son ya los está viendo en el listado.
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

        const horario = await prisma.horario.update({
            where: {
                id: id
            },
            data: datos,
            include: {
                cancha: true
            }
        });

        res.json(aRespuesta(horario));
    } catch (error) {
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
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al eliminar el horario'
        });
    }
};

// Además de los handlers se exportan las funciones puras del controller: no
// tocan la base ni el request, son las reglas del negocio en su forma más
// chica, y exportarlas es lo que permite cubrirlas con tests unitarios sin
// levantar el servidor.
module.exports = {
    listarHorarios,
    crearHorario,
    generarHorarios,
    obtenerHorario,
    actualizarHorario,
    eliminarHorario,
    validarDatos,
    validarLote,
    generarTurnos,
    seSolapan,
    aRespuesta
};

const prisma = require('../config/prisma');
const ROLES = require('../config/roles');

/**
 * Una reserva es de quien la hizo. El administrador ve y gestiona todas (es el
 * mostrador del complejo); el cliente, solo las suyas.
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

/**
 * Marca del error que se lanza dentro de la transacción cuando el equipamiento
 * pedido no existe o no alcanza para el turno. Lleva `respuesta` con el código y
 * el mensaje, porque son dos casos distintos (400 y 409).
 */
const EQUIPAMIENTO_INVALIDO = 'EQUIPAMIENTO_INVALIDO';

/**
 * Código con el que Prisma reporta que la base abortó la transacción por un
 * conflicto con otra que corría a la vez. Ver `OPCIONES_CON_EQUIPAMIENTO`.
 */
const CODIGO_CONFLICTO = 'P2034';

/**
 * Las transacciones que reparten equipamiento corren serializables.
 *
 * El candado del turno no alcanza: dos reservas de turnos distintos pero
 * superpuestos (dos canchas a la misma hora) pueden pedir la última pelota a la
 * vez, y cada una contaría lo alquilado sin ver a la otra. Serializable hace que
 * la base las ordene: si se pisan, aborta una de las dos y esa responde 409.
 *
 * Solo se usa cuando la reserva lleva equipamiento: las que no, no compiten por
 * nada más que el turno, y ese ya lo resuelve el `updateMany` condicional.
 */
const OPCIONES_CON_EQUIPAMIENTO = { isolationLevel: 'Serializable' };

/** Estado con el que nace una reserva. Ver el comentario del enum en el schema. */
const ESTADO_INICIAL = 'PENDIENTE';

/** Estado al que llega una reserva ya paga. */
const ESTADO_CONFIRMADA = 'CONFIRMADA';

/** Estado al que llega una reserva cancelada. */
const ESTADO_CANCELADA = 'CANCELADA';

/** Estado de un pago que dejó de contar. Ver el enum `EstadoPago` del schema. */
const PAGO_ANULADO = 'ANULADO';

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

/** Suma dos importes redondeando a centavos, por lo mismo que `precioDe`. */
const sumarImportes = (a, b) => Math.round((Number(a) + Number(b)) * 100) / 100;

/** Precio del artículo por la cantidad que se lleva, redondeado a centavos. */
const subtotalDe = (precio, cantidad) => Math.round(Number(precio) * cantidad * 100) / 100;

/**
 * Valida el equipamiento que llega al reservar. Es opcional: si no viene, la
 * reserva es la cancha y nada más. Devuelve `{ mensaje }` si algo no cumple o
 * `{ items }` con los pedidos ya convertidos a número.
 */
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

        // Las unidades se prestan enteras, y pedir cero de algo es no pedirlo.
        if (!Number.isInteger(cantidad) || cantidad < 1) {
            return { mensaje: 'La cantidad de cada artículo debe ser un número entero mayor a cero' };
        }

        // Se rechaza en vez de sumarlo: dos renglones del mismo artículo son casi
        // seguro un error de quien armó el pedido, y adivinar cuál quiso es peor.
        if (items.some((item) => item.equipamientoId === equipamientoId)) {
            return { mensaje: 'Un artículo no puede aparecer dos veces en la misma reserva' };
        }

        items.push({ equipamientoId, cantidad });
    }

    return { items };
};

/**
 * Cuántas unidades de cada artículo ya están alquiladas, a partir de las filas
 * de `ReservaEquipamiento` que ocupan el turno. Devuelve un `Map` de id a total.
 */
const sumarAlquilado = (filas) => {
    const alquilado = new Map();

    for (const fila of filas) {
        alquilado.set(fila.equipamientoId, (alquilado.get(fila.equipamientoId) ?? 0) + fila.cantidad);
    }

    return alquilado;
};

/** Unidades de un artículo que quedan libres para un turno. Nunca negativas. */
const disponiblesDe = (equipamiento, alquilado) =>
    Math.max(0, equipamiento.stock - (alquilado.get(equipamiento.id) ?? 0));

/**
 * Comprueba que lo pedido exista y alcance para el turno, y arma las filas de
 * `ReservaEquipamiento` con su subtotal.
 *
 * `equipamientos` son los artículos pedidos tal como están en la base y
 * `alquilado`, lo que ya ocupan las otras reservas del turno (ver
 * `alquiladoEnTurno`). Devuelve `{ codigo, mensaje }` si algo falla, o
 * `{ filas, total }`.
 */
const armarEquipamientos = (items, equipamientos, alquilado) => {
    const filas = [];
    let total = 0;

    for (const item of items) {
        const equipamiento = equipamientos.find((candidato) => candidato.id === item.equipamientoId);

        // Llega en el cuerpo del request, así que es un dato inválido del
        // cliente y no un recurso faltante.
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

/**
 * Lee lo que ya está alquilado durante un turno: las filas de equipamiento de las
 * reservas no canceladas del mismo día cuyo horario se superpone. Dos horarios se
 * superponen cuando cada uno empieza antes de que termine el otro, el mismo
 * criterio que usa `horario.controller.js` para los turnos de una cancha; acá no
 * importa la cancha, porque las pelotas son del complejo.
 *
 * `db` es el cliente de Prisma o la transacción en curso. `reservaIdExcluida` es
 * la reserva que se está reprogramando, que no compite consigo misma.
 *
 * Se exporta porque el listado de equipamiento la usa para mostrar cuántas
 * unidades quedan: así la regla vive en un solo lugar.
 */
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

/**
 * Dentro de una transacción: trae los artículos pedidos, lo que ya está
 * alquilado en el turno, y arma las filas. Si algo no da, lanza el centinela
 * `EQUIPAMIENTO_INVALIDO` para abortar la transacción entera (la reserva no
 * puede quedar hecha sin el equipamiento que se pidió con ella).
 */
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

/**
 * Responde los errores que se lanzan desde las transacciones de alta y
 * reprogramación. Devuelve `true` si era uno de ellos y ya respondió.
 */
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
    },
    // Los pagos incluidos traen su propio Decimal y su propia fecha DATE. Se
    // adaptan acá y no reutilizando el `aRespuesta` de `pago.controller.js`
    // porque ese ya depende de este: importarlo sería un `require` circular.
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

/**
 * Relaciones que acompañan a la reserva en todas las respuestas. La cancha viaja
 * con su tipo porque el detalle de una reserva lo muestra, y pedirlo aparte
 * sería una consulta más por cada reserva que se abre.
 *
 * El evento va por el mismo motivo: el detalle lo muestra y el alta de un evento
 * necesita saber qué reservas todavía no tienen uno. Viene `null` en la mayoría
 * de las reservas, que son un partido y nada más.
 *
 * El equipamiento, con el artículo de cada fila, también lo muestra el detalle.
 */
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

/**
 * Lo que falta pagar de una reserva: su precio total menos los pagos que no
 * están anulados.
 *
 * Vive acá y no en `pago.controller.js` porque de esto depende el estado de la
 * reserva, que es asunto de la reserva. Al revés, además, sería un `require`
 * circular: el controller de pagos ya depende de este.
 */
const saldoDe = (precioTotal, pagos = []) => {
    const pagado = pagos
        .filter((pago) => pago.estado !== PAGO_ANULADO)
        .reduce((total, pago) => total + Number(pago.monto), 0);

    return Number(precioTotal) - pagado;
};

/**
 * El estado que le corresponde a una reserva según lo que se le haya pagado.
 *
 * Una reserva cancelada no vuelve sola: cancelar es una decisión, no algo que se
 * derive de la plata. El saldo se compara contra cero y no contra el total
 * porque puede quedar negativo si la reserva se reprogramó a un turno más barato
 * después de estar paga.
 */
const estadoSegunPagos = (reserva, pagos) => {
    if (reserva.estado === ESTADO_CANCELADA) {
        return ESTADO_CANCELADA;
    }

    return saldoDe(reserva.precioTotal, pagos) <= 0 ? ESTADO_CONFIRMADA : ESTADO_INICIAL;
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

    // El equipamiento hace falta al reprogramar: hay que volver a comprobar que
    // alcance en el turno nuevo.
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
 *
 * El equipamiento viaja en el mismo request (y no en uno aparte, como el
 * evento) porque cambia el precio total: la reserva y lo que se alquila con ella
 * se guardan juntos o no se guarda nada.
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

        // Sin esto, reprogramar al mismo turno liberaría el turno viejo (que es
        // el mismo) después de haberlo tomado, y la reserva quedaría ocupando un
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

            // Lo alquilado viaja con la reserva, así que tiene que alcanzar
            // también en el turno nuevo. La reserva se excluye del conteo: si el
            // turno nuevo se superpone con el viejo, no compite consigo misma.
            await reservarEquipamiento(
                tx,
                horario,
                reserva.equipamientos.map(({ equipamientoId, cantidad }) => ({ equipamientoId, cantidad })),
                reserva.id
            );

            // El precio del turno se vuelve a copiar, pero el del equipamiento
            // no: sus subtotales son lo que se cobró al reservarlo, y reprogramar
            // cambia el horario, no lo que se alquiló.
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

            // Reprogramar copia el precio del turno nuevo, así que lo que ya se
            // pagó puede dejar de alcanzar: una reserva paga que se mueve a un
            // turno más caro vuelve a PENDIENTE. Al revés no hay nada que
            // devolver, y el saldo negativo se da por cubierto.
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

// Además de los handlers se exportan las funciones puras del controller: no
// tocan la base ni el request, son las reglas del negocio en su forma más
// chica, y exportarlas es lo que permite cubrirlas con tests unitarios sin
// levantar el servidor.
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

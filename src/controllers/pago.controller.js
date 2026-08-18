const prisma = require('../config/prisma');
const ROLES = require('../config/roles');
// Del controller de reservas salen tres cosas: las conversiones de la reserva
// anidada —sutiles, y dos copias se terminan desincronizando— y las dos reglas
// que definen su estado a partir de lo pagado. Esas viven allá porque el estado
// de la reserva es asunto de la reserva; la dependencia va en un solo sentido.
const {
    aRespuesta: reservaARespuesta,
    saldoDe,
    estadoSegunPagos
} = require('./reserva.controller');

/** Métodos que acepta el enum `MetodoPago` del schema. */
const METODOS_VALIDOS = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'];

/** Estado con el que nace un pago. */
const ESTADO_INICIAL = 'REGISTRADO';

/** Estado al que llega un pago anulado. Ver el comentario del enum en el schema. */
const ESTADO_ANULADO = 'ANULADO';

/** Estado en el que una reserva ya no admite cobros. */
const RESERVA_CANCELADA = 'CANCELADA';

/**
 * Un pago es de quien es su reserva. El administrador los ve todos —es el
 * mostrador del complejo— y es el único que puede registrarlos o anularlos: la
 * plata la cobra el complejo, no la declara el cliente.
 */
const esAdmin = (usuario) => usuario.rol.nombre === ROLES.ADMIN;

const esPropia = (reserva, usuario) => reserva.usuarioId === usuario.id;

/**
 * Relaciones que acompañan al pago en todas las respuestas. La reserva viaja
 * entera porque el listado tiene que poder identificar de cuál es cada pago, y
 * pedirla aparte sería una consulta más por fila.
 */
const RELACIONES = {
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

/**
 * Relee el pago con sus relaciones.
 *
 * Registrar y anular cambian el estado de la reserva *después* de tocar el pago,
 * así que la reserva que se incluyó en esa primera escritura ya quedó vieja. Se
 * vuelve a pedir para que el cliente reciba el estado que quedó, y no el previo.
 */
const conRelaciones = (id) =>
    prisma.pago.findUnique({
        where: {
            id: id
        },
        include: RELACIONES
    });

/**
 * Adapta el pago antes de responder: el `Decimal` a número y la fecha `DATE` a
 * "AAAA-MM-DD", con el mismo criterio que el resto de la API.
 */
const aRespuesta = (pago) => ({
    ...pago,
    monto: Number(pago.monto),
    fecha: pago.fecha.toISOString().slice(0, 10),
    reserva: pago.reserva && reservaARespuesta(pago.reserva)
});

/**
 * Valida los campos del cuerpo y los devuelve ya normalizados.
 *
 * `fecha` y `estado` no entran: el día lo pone el servidor —un pago se registra
 * cuando se cobra— y el estado nace REGISTRADO. `reservaId` se valida solo en el
 * alta: un pago no se muda de reserva.
 */
const validarDatos = (body) => {
    const monto = Number(body.monto);
    const metodo = typeof body.metodo === 'string' ? body.metodo.trim() : '';

    if (isNaN(monto) || monto <= 0) {
        return { mensaje: 'El monto debe ser un número mayor a cero' };
    }

    if (!METODOS_VALIDOS.includes(metodo)) {
        return { mensaje: `El método debe ser ${METODOS_VALIDOS.join(', ')}` };
    }

    return { datos: { monto, metodo } };
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

    if (query.estado !== undefined) {
        if (![ESTADO_INICIAL, ESTADO_ANULADO].includes(query.estado)) {
            return { mensaje: `El estado debe ser ${ESTADO_INICIAL}, ${ESTADO_ANULADO}` };
        }

        filtro.estado = query.estado;
    }

    return { filtro };
};

/**
 * Deja la reserva en el estado que le corresponde según sus pagos. Se llama
 * después de registrar o anular uno, dentro de la misma transacción.
 */
const recalcularReserva = async (tx, reservaId) => {
    const reserva = await tx.reserva.findUnique({
        where: {
            id: reservaId
        },
        include: {
            pagos: true
        }
    });

    const estado = estadoSegunPagos(reserva, reserva.pagos);

    if (estado === reserva.estado) {
        return;
    }

    await tx.reserva.update({
        where: {
            id: reservaId
        },
        data: {
            estado: estado
        }
    });
};

const listarPagos = async (req, res) => {
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

        // Los más nuevos primero: es el orden en el que se miran las cobranzas.
        const pagos = await prisma.pago.findMany({
            where: filtro,
            include: RELACIONES,
            orderBy: [{ fecha: 'desc' }, { id: 'desc' }]
        });

        res.json(pagos.map(aRespuesta));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al listar los pagos'
        });
    }
};

/**
 * Registra el cobro de una reserva.
 *
 * El monto no puede superar lo que falta pagar: cobrar de más dejaría a la
 * reserva con un saldo negativo que el sistema no sabe devolver. La fecha y el
 * estado los pone el servidor.
 */
const crearPago = async (req, res) => {
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

        const reserva = await prisma.reserva.findUnique({
            where: {
                id: reservaId
            },
            include: {
                pagos: true
            }
        });

        // La reserva llega en el cuerpo del request, así que un id inexistente es
        // un dato inválido del cliente (400) y no un recurso faltante (404).
        if (!reserva) {
            return res.status(400).json({
                mensaje: 'La reserva indicada no existe'
            });
        }

        if (reserva.estado === RESERVA_CANCELADA) {
            return res.status(409).json({
                mensaje: 'La reserva está cancelada y no admite pagos'
            });
        }

        const saldo = saldoDe(reserva.precioTotal, reserva.pagos);

        if (saldo <= 0) {
            return res.status(409).json({
                mensaje: 'La reserva ya está paga'
            });
        }

        if (datos.monto > saldo) {
            return res.status(409).json({
                mensaje: `El monto supera el saldo de la reserva, que es ${saldo}`
            });
        }

        // El pago y el estado de la reserva se escriben juntos: una reserva que
        // quedara PENDIENTE con su total ya cobrado sería peor que no registrar
        // el pago.
        const creado = await prisma.$transaction(async (tx) => {
            const pago = await tx.pago.create({
                data: {
                    ...datos,
                    // Solo el día, sin hora: es un DATE y se compara como tal.
                    fecha: new Date(new Date().toISOString().slice(0, 10)),
                    estado: ESTADO_INICIAL,
                    reservaId: reservaId
                }
            });

            await recalcularReserva(tx, reservaId);

            return pago;
        });

        res.status(201).json(aRespuesta(await conRelaciones(creado.id)));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al registrar el pago'
        });
    }
};

const obtenerPago = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        const pago = await prisma.pago.findUnique({
            where: {
                id: id
            },
            include: RELACIONES
        });

        if (!pago) {
            return res.status(404).json({
                mensaje: 'Pago no encontrado'
            });
        }

        if (!esAdmin(req.usuario) && !esPropia(pago.reserva, req.usuario)) {
            return res.status(403).json({
                mensaje: 'La reserva es de otro usuario'
            });
        }

        res.json(aRespuesta(pago));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al obtener el pago'
        });
    }
};

/**
 * Corrige cómo se cobró un pago ya registrado.
 *
 * Lo único editable es el método: el monto de un pago no se edita —para eso se
 * anula y se registra el correcto— y la reserva tampoco, porque un pago no se
 * muda. Con el monto fijo, esta operación no puede cambiar el estado de la
 * reserva.
 */
const actualizarPago = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        const metodo = typeof req.body.metodo === 'string' ? req.body.metodo.trim() : '';

        if (!METODOS_VALIDOS.includes(metodo)) {
            return res.status(400).json({
                mensaje: `El método debe ser ${METODOS_VALIDOS.join(', ')}`
            });
        }

        const pagoExistente = await prisma.pago.findUnique({
            where: {
                id: id
            }
        });

        if (!pagoExistente) {
            return res.status(404).json({
                mensaje: 'Pago no encontrado'
            });
        }

        if (pagoExistente.estado === ESTADO_ANULADO) {
            return res.status(409).json({
                mensaje: 'El pago está anulado y no se puede modificar'
            });
        }

        const pago = await prisma.pago.update({
            where: {
                id: id
            },
            data: {
                metodo: metodo
            },
            include: RELACIONES
        });

        res.json(aRespuesta(pago));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al actualizar el pago'
        });
    }
};

/**
 * Anula un pago.
 *
 * No hay `DELETE` a propósito: un pago es un registro de plata y se conserva
 * como historial, igual que una reserva cancelada. Anularlo lo saca de la cuenta
 * del saldo, así que una reserva que estaba CONFIRMADA vuelve a PENDIENTE.
 */
const anularPago = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        const pagoExistente = await prisma.pago.findUnique({
            where: {
                id: id
            }
        });

        if (!pagoExistente) {
            return res.status(404).json({
                mensaje: 'Pago no encontrado'
            });
        }

        if (pagoExistente.estado === ESTADO_ANULADO) {
            return res.status(409).json({
                mensaje: 'El pago ya está anulado'
            });
        }

        await prisma.$transaction(async (tx) => {
            await tx.pago.update({
                where: {
                    id: id
                },
                data: {
                    estado: ESTADO_ANULADO
                }
            });

            await recalcularReserva(tx, pagoExistente.reservaId);
        });

        res.json(aRespuesta(await conRelaciones(id)));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al anular el pago'
        });
    }
};

// Además de los handlers se exportan las funciones puras del controller: no
// tocan la base ni el request, son las reglas del negocio en su forma más
// chica, y exportarlas es lo que permite cubrirlas con tests unitarios sin
// levantar el servidor.
module.exports = {
    listarPagos,
    crearPago,
    obtenerPago,
    actualizarPago,
    anularPago,
    validarDatos,
    armarFiltro,
    aRespuesta
};

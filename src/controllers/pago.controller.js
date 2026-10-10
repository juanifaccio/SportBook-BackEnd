const prisma = require('../config/prisma');
const ROLES = require('../config/roles');
const {
    aRespuesta: reservaARespuesta,
    saldoDe,
    estadoSegunPagos
} = require('./reserva.controller');

const METODOS_VALIDOS = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'];

const ESTADO_INICIAL = 'REGISTRADO';

const ESTADO_ANULADO = 'ANULADO';

const RESERVA_CANCELADA = 'CANCELADA';

const esAdmin = (usuario) => usuario.rol.nombre === ROLES.ADMIN;

const esPropia = (reserva, usuario) => reserva.usuarioId === usuario.id;

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

const conRelaciones = (id) =>
    prisma.pago.findUnique({
        where: {
            id: id
        },
        include: RELACIONES
    });

const aRespuesta = (pago) => ({
    ...pago,
    monto: Number(pago.monto),
    fecha: pago.fecha.toISOString().slice(0, 10),
    reserva: pago.reserva && reservaARespuesta(pago.reserva)
});

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

        if (!esAdmin(req.usuario)) {
            filtro.reserva = {
                usuarioId: req.usuario.id
            };
        }

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

        const creado = await prisma.$transaction(async (tx) => {
            const pago = await tx.pago.create({
                data: {
                    ...datos,
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

const prisma = require('../config/prisma');

/** Código con el que Prisma reporta la violación de un índice único. */
const CODIGO_DUPLICADO = 'P2002';

/** Código con el que Prisma reporta la violación de una clave foránea. */
const CODIGO_CLAVE_FORANEA = 'P2003';

/** Estados que acepta el enum `EstadoCancha` del schema. */
const ESTADOS_VALIDOS = ['DISPONIBLE', 'MANTENIMIENTO'];

/**
 * Normaliza un texto recibido del cliente. El `trim` del nombre no es cosmético:
 * la colación de la base ignora mayúsculas, acentos y espacios al final, pero
 * **no** los espacios al principio, así que sin esto una " Cancha 1" se colaría
 * junto a la que ya existe y el índice único no lo detendría.
 */
const normalizar = (texto) => (typeof texto === 'string' ? texto.trim() : '');

/**
 * Prisma devuelve `precioPorHora` como un Decimal, que al serializarse a JSON
 * viaja como string. El frontend lo necesita como número para poder formatearlo
 * y multiplicarlo, así que se convierte antes de responder.
 */
const aRespuesta = (cancha) => ({
    ...cancha,
    precioPorHora: Number(cancha.precioPorHora)
});

/**
 * Valida los campos del cuerpo y los devuelve ya normalizados. Si algo no cumple
 * devuelve `{ mensaje }` con el error a informar, para que crear y actualizar
 * apliquen exactamente las mismas reglas.
 */
const validarDatos = (body) => {
    const nombre = normalizar(body.nombre);
    const precioPorHora = Number(body.precioPorHora);
    const estado = normalizar(body.estado);
    const tipoCanchaId = parseInt(body.tipoCanchaId);

    if (!nombre) {
        return { mensaje: 'El nombre es obligatorio' };
    }

    if (isNaN(precioPorHora) || precioPorHora <= 0) {
        return { mensaje: 'El precio por hora debe ser un número mayor a cero' };
    }

    if (!ESTADOS_VALIDOS.includes(estado)) {
        return { mensaje: 'El estado debe ser DISPONIBLE o MANTENIMIENTO' };
    }

    if (isNaN(tipoCanchaId)) {
        return { mensaje: 'El tipo de cancha es obligatorio' };
    }

    return { datos: { nombre, precioPorHora, estado, tipoCanchaId } };
};

/**
 * Arma el filtro del listado a partir de la query. Devuelve `{ mensaje }` si un
 * valor no sirve, con la misma forma que `validarDatos`, para que el handler
 * responda 400 sin distinguir de dónde vino el error.
 *
 * Filtrar por tipo lo resuelve la base y no el navegador: el listado se pide
 * para ver las canchas de un tipo, y traer el complejo entero para descartar la
 * mayoría en el cliente es trabajo de más que además crece con cada cancha.
 */
const armarFiltro = (query) => {
    const filtro = {};

    if (query.tipoCanchaId !== undefined) {
        const tipoCanchaId = parseInt(query.tipoCanchaId);

        if (isNaN(tipoCanchaId)) {
            return { mensaje: 'El id del tipo de cancha debe ser un número' };
        }

        filtro.tipoCanchaId = tipoCanchaId;
    }

    return { filtro };
};

const listarCanchas = async (req, res) => {
    try {
        const { mensaje, filtro } = armarFiltro(req.query);

        if (mensaje) {
            return res.status(400).json({
                mensaje: mensaje
            });
        }

        // Se incluye el tipo para que el listado del frontend pueda mostrar su
        // nombre sin tener que pedirlo cancha por cancha. Ordenadas por nombre:
        // es un listado para buscar una cancha, y el orden de alta no ayuda a
        // encontrarla. El nombre es único, así que el orden es siempre el mismo.
        const canchas = await prisma.cancha.findMany({
            where: filtro,
            include: {
                tipoCancha: true
            },
            orderBy: {
                nombre: 'asc'
            }
        });

        res.json(canchas.map(aRespuesta));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al listar las canchas'
        });
    }
};

const crearCancha = async (req, res) => {
    try {
        const { mensaje, datos } = validarDatos(req.body);

        if (mensaje) {
            return res.status(400).json({
                mensaje: mensaje
            });
        }

        const tipoCancha = await prisma.tipoCancha.findUnique({
            where: {
                id: datos.tipoCanchaId
            }
        });

        // El tipo llega en el cuerpo del request, así que un id inexistente es un
        // dato inválido del cliente (400) y no un recurso faltante en la URL (404).
        if (!tipoCancha) {
            return res.status(400).json({
                mensaje: 'El tipo de cancha indicado no existe'
            });
        }

        const cancha = await prisma.cancha.create({
            data: datos,
            include: {
                tipoCancha: true
            }
        });

        res.status(201).json(aRespuesta(cancha));
    } catch (error) {
        if (error.code === CODIGO_DUPLICADO) {
            return res.status(409).json({
                mensaje: 'Ya existe una cancha con ese nombre'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al crear la cancha'
        });
    }
};

const obtenerCancha = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        const cancha = await prisma.cancha.findUnique({
            where: {
                id: id
            },
            include: {
                tipoCancha: true
            }
        });

        if (!cancha) {
            return res.status(404).json({
                mensaje: 'Cancha no encontrada'
            });
        }

        res.json(aRespuesta(cancha));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al obtener la cancha'
        });
    }
};

const actualizarCancha = async (req, res) => {
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

        const canchaExistente = await prisma.cancha.findUnique({
            where: {
                id: id
            }
        });

        if (!canchaExistente) {
            return res.status(404).json({
                mensaje: 'Cancha no encontrada'
            });
        }

        const tipoCancha = await prisma.tipoCancha.findUnique({
            where: {
                id: datos.tipoCanchaId
            }
        });

        if (!tipoCancha) {
            return res.status(400).json({
                mensaje: 'El tipo de cancha indicado no existe'
            });
        }

        const cancha = await prisma.cancha.update({
            where: {
                id: id
            },
            data: datos,
            include: {
                tipoCancha: true
            }
        });

        res.json(aRespuesta(cancha));
    } catch (error) {
        if (error.code === CODIGO_DUPLICADO) {
            return res.status(409).json({
                mensaje: 'Ya existe una cancha con ese nombre'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al actualizar la cancha'
        });
    }
};

const eliminarCancha = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        const canchaExistente = await prisma.cancha.findUnique({
            where: {
                id: id
            }
        });

        if (!canchaExistente) {
            return res.status(404).json({
                mensaje: 'Cancha no encontrada'
            });
        }

        await prisma.cancha.delete({
            where: {
                id: id
            }
        });

        res.json({
            mensaje: 'Cancha eliminada correctamente'
        });
    } catch (error) {
        // La FK de Horario impide borrar una cancha que tiene turnos cargados:
        // sin esto el error de la base saldría como un 500.
        if (error.code === CODIGO_CLAVE_FORANEA) {
            return res.status(409).json({
                mensaje: 'No se puede eliminar la cancha porque tiene horarios asociados'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al eliminar la cancha'
        });
    }
};

// Además de los handlers se exportan las funciones puras del controller: no
// tocan la base ni el request, son las reglas del negocio en su forma más
// chica, y exportarlas es lo que permite cubrirlas con tests unitarios sin
// levantar el servidor.
module.exports = {
    listarCanchas,
    crearCancha,
    obtenerCancha,
    actualizarCancha,
    eliminarCancha,
    validarDatos,
    armarFiltro,
    aRespuesta
};

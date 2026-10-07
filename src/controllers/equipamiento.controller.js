const prisma = require('../config/prisma');
const { alquiladoEnTurno, disponiblesDe } = require('./reserva.controller');

/** Código con el que Prisma reporta la violación de un índice único. */
const CODIGO_DUPLICADO = 'P2002';

/** Código con el que Prisma reporta la violación de una clave foránea. */
const CODIGO_CLAVE_FORANEA = 'P2003';

/**
 * Normaliza un texto recibido del cliente. El `trim` del nombre no es cosmético:
 * la colación de la base ignora mayúsculas, acentos y espacios al final, pero
 * **no** los espacios al principio, así que sin esto una " Pelota" se colaría
 * junto a la que ya existe y el índice único no lo detendría.
 */
const normalizar = (texto) => (typeof texto === 'string' ? texto.trim() : '');

/**
 * Prisma devuelve `precio` como un Decimal, que al serializarse a JSON viaja
 * como string. El frontend lo necesita como número para formatearlo y
 * multiplicarlo por la cantidad al reservar.
 */
const aRespuesta = (equipamiento) => ({
    ...equipamiento,
    precio: Number(equipamiento.precio)
});

/**
 * Valida los campos del cuerpo y los devuelve ya normalizados. Si algo no cumple
 * devuelve `{ mensaje }` con el error a informar, para que crear y actualizar
 * apliquen exactamente las mismas reglas.
 */
const validarDatos = (body) => {
    const nombre = normalizar(body.nombre);
    const descripcion = normalizar(body.descripcion);
    const precio = Number(body.precio);
    const stock = Number(body.stock);

    if (!nombre) {
        return { mensaje: 'El nombre es obligatorio' };
    }

    if (!descripcion) {
        return { mensaje: 'La descripción es obligatoria' };
    }

    if (isNaN(precio) || precio <= 0) {
        return { mensaje: 'El precio debe ser un número mayor a cero' };
    }

    // El stock son unidades que se prestan de a una, así que un valor con
    // decimales no significa nada. El cero sí: un artículo agotado sigue estando
    // en el catálogo, y es lo que permite darlo de baja sin borrarlo.
    if (isNaN(stock) || !Number.isInteger(stock) || stock < 0) {
        return { mensaje: 'El stock debe ser un número entero mayor o igual a cero' };
    }

    return { datos: { nombre, descripcion, precio, stock } };
};

/**
 * Lee el turno de `?horarioId=`, si vino. Devuelve `{ codigo, mensaje }` si no
 * sirve, `{ horario }` si sí, o `{}` si no se pidió.
 */
const buscarTurnoDelFiltro = async (query) => {
    if (query.horarioId === undefined) {
        return {};
    }

    const horarioId = parseInt(query.horarioId);

    if (isNaN(horarioId)) {
        return { codigo: 400, mensaje: 'El id del turno debe ser un número' };
    }

    const horario = await prisma.horario.findUnique({
        where: {
            id: horarioId
        }
    });

    // A diferencia del filtro por tipo de las canchas, acá un turno inexistente
    // sí es un error: no es una búsqueda sin resultados, sino una pregunta
    // (cuánto queda libre en este turno) que no tiene respuesta.
    if (!horario) {
        return { codigo: 404, mensaje: 'Turno no encontrado' };
    }

    return { horario };
};

/**
 * Lista el catálogo. Con `?horarioId=` cada artículo viene además con
 * `disponibles`: las unidades que quedan libres durante ese turno, que es lo que
 * la pantalla de reservar necesita para no ofrecer lo que ya está alquilado. La
 * cuenta es la misma que hace el alta de la reserva (`alquiladoEnTurno`), así
 * que lo que se muestra es lo que después se acepta.
 */
const listarEquipamientos = async (req, res) => {
    try {
        const { codigo, mensaje, horario } = await buscarTurnoDelFiltro(req.query);

        if (mensaje) {
            return res.status(codigo).json({
                mensaje: mensaje
            });
        }

        // Ordenado por nombre: es un catálogo que se recorre para encontrar un
        // artículo, y el orden de alta no ayuda a eso. El nombre es único, así
        // que el orden es siempre el mismo.
        const equipamientos = await prisma.equipamiento.findMany({
            orderBy: {
                nombre: 'asc'
            }
        });

        if (!horario) {
            return res.json(equipamientos.map(aRespuesta));
        }

        const alquilado = await alquiladoEnTurno(prisma, horario);

        res.json(
            equipamientos.map((equipamiento) => ({
                ...aRespuesta(equipamiento),
                disponibles: disponiblesDe(equipamiento, alquilado)
            }))
        );
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al listar el equipamiento'
        });
    }
};

const crearEquipamiento = async (req, res) => {
    try {
        const { mensaje, datos } = validarDatos(req.body);

        if (mensaje) {
            return res.status(400).json({
                mensaje: mensaje
            });
        }

        const equipamiento = await prisma.equipamiento.create({
            data: datos
        });

        res.status(201).json(aRespuesta(equipamiento));
    } catch (error) {
        if (error.code === CODIGO_DUPLICADO) {
            return res.status(409).json({
                mensaje: 'Ya existe un equipamiento con ese nombre'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al crear el equipamiento'
        });
    }
};

const obtenerEquipamiento = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        const equipamiento = await prisma.equipamiento.findUnique({
            where: {
                id: id
            }
        });

        if (!equipamiento) {
            return res.status(404).json({
                mensaje: 'Equipamiento no encontrado'
            });
        }

        res.json(aRespuesta(equipamiento));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al obtener el equipamiento'
        });
    }
};

const actualizarEquipamiento = async (req, res) => {
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

        const equipamientoExistente = await prisma.equipamiento.findUnique({
            where: {
                id: id
            }
        });

        if (!equipamientoExistente) {
            return res.status(404).json({
                mensaje: 'Equipamiento no encontrado'
            });
        }

        const equipamiento = await prisma.equipamiento.update({
            where: {
                id: id
            },
            data: datos
        });

        res.json(aRespuesta(equipamiento));
    } catch (error) {
        if (error.code === CODIGO_DUPLICADO) {
            return res.status(409).json({
                mensaje: 'Ya existe un equipamiento con ese nombre'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al actualizar el equipamiento'
        });
    }
};

const eliminarEquipamiento = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        const equipamientoExistente = await prisma.equipamiento.findUnique({
            where: {
                id: id
            }
        });

        if (!equipamientoExistente) {
            return res.status(404).json({
                mensaje: 'Equipamiento no encontrado'
            });
        }

        await prisma.equipamiento.delete({
            where: {
                id: id
            }
        });

        res.json({
            mensaje: 'Equipamiento eliminado correctamente'
        });
    } catch (error) {
        // Un artículo que ya se alquiló en alguna reserva queda en su historial:
        // la FK de `ReservaEquipamiento` impide borrarlo, y sin esto el error de
        // la base saldría como un 500. Para sacarlo de circulación alcanza con
        // dejarle el stock en cero.
        if (error.code === CODIGO_CLAVE_FORANEA) {
            return res.status(409).json({
                mensaje: 'No se puede eliminar el equipamiento porque hay reservas que lo incluyen'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al eliminar el equipamiento'
        });
    }
};

// Además de los handlers se exportan las funciones puras del controller: no
// tocan la base ni el request, son las reglas del negocio en su forma más
// chica, y exportarlas es lo que permite cubrirlas con tests unitarios sin
// levantar el servidor.
module.exports = {
    listarEquipamientos,
    crearEquipamiento,
    obtenerEquipamiento,
    actualizarEquipamiento,
    eliminarEquipamiento,
    validarDatos,
    aRespuesta
};

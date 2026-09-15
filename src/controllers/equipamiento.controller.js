const prisma = require('../config/prisma');

/** Código con el que Prisma reporta la violación de un índice único. */
const CODIGO_DUPLICADO = 'P2002';

/**
 * Normaliza un texto recibido del cliente. El `trim` del nombre no es cosmético:
 * la colación de la base ignora mayúsculas, acentos y espacios al final, pero
 * **no** los espacios al principio, así que sin esto una " Pelota" se colaría
 * junto a la que ya existe y el índice único no lo detendría.
 */
const normalizar = (texto) => (typeof texto === 'string' ? texto.trim() : '');

/**
 * Prisma devuelve `precio` como un Decimal, que al serializarse a JSON viaja
 * como string. El frontend lo necesita como número para formatearlo y, cuando
 * exista la reserva con equipamiento, multiplicarlo por la cantidad.
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

const listarEquipamientos = async (req, res) => {
    try {
        // Ordenado por nombre: es un catálogo que se recorre para encontrar un
        // artículo, y el orden de alta no ayuda a eso. El nombre es único, así
        // que el orden es siempre el mismo.
        const equipamientos = await prisma.equipamiento.findMany({
            orderBy: {
                nombre: 'asc'
            }
        });

        res.json(equipamientos.map(aRespuesta));
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

        // Todavía no hay un 409 por clave foránea como el de Cancha: nada
        // referencia al equipamiento hasta que exista `ReservaEquipamiento`, y
        // atrapar un error que la base no puede tirar sería código inalcanzable.
        // Ese caso entra con la tarea de reservar con equipamiento.
        await prisma.equipamiento.delete({
            where: {
                id: id
            }
        });

        res.json({
            mensaje: 'Equipamiento eliminado correctamente'
        });
    } catch (error) {
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

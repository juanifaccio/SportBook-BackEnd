const bcrypt = require('bcryptjs');

const prisma = require('../config/prisma');

/** Código con el que Prisma reporta la violación de un índice único. */
const CODIGO_DUPLICADO = 'P2002';

/** Código con el que Prisma reporta la violación de una clave foránea. */
const CODIGO_CLAVE_FORANEA = 'P2003';

/**
 * Formato mínimo de un email: algo, arroba, dominio con al menos un punto. No
 * pretende validar la especificación completa —eso solo lo confirma mandar un
 * mail—, sino frenar los errores de tipeo evidentes.
 */
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Dígitos, espacios, guiones, paréntesis y un `+` inicial. */
const FORMATO_TELEFONO = /^\+?[\d\s()-]{6,20}$/;

/** Largo mínimo de la contraseña, en caracteres. */
const LARGO_MINIMO_CONTRASENA = 8;

/**
 * Costo del hash de bcrypt. Diez rondas es el valor por defecto de la librería:
 * suficientemente lento para un ataque por fuerza bruta y suficientemente rápido
 * para no demorar el alta de un usuario.
 */
const RONDAS_HASH = 10;

const normalizar = (texto) => (typeof texto === 'string' ? texto.trim() : '');

/**
 * Saca `contrasena` del objeto antes de responder. Todas las respuestas de este
 * controller pasan por acá, así que el hash no puede filtrarse por olvidarse de
 * excluirlo en un endpoint nuevo.
 */
const aRespuesta = (usuario) => {
    const { contrasena, ...resto } = usuario;

    return resto;
};

/**
 * Valida los campos del cuerpo y los devuelve ya normalizados. Si algo no cumple
 * devuelve `{ mensaje }` con el error a informar, para que crear y actualizar
 * apliquen exactamente las mismas reglas.
 *
 * La contraseña es el único campo que se comporta distinto según el caso: al dar
 * de alta es obligatoria, pero al editar se puede omitir para dejar la que ya
 * estaba, así que no se puede pedir que el formulario la reenvíe (no la tiene:
 * la API nunca la devuelve).
 */
const validarDatos = (body, esEdicion) => {
    const nombre = normalizar(body.nombre);
    // El email se guarda en minúsculas para que el índice único no deje entrar
    // el mismo usuario dos veces escrito con mayúsculas distintas.
    const email = normalizar(body.email).toLowerCase();
    const contrasena = typeof body.contrasena === 'string' ? body.contrasena : '';
    const telefono = normalizar(body.telefono);
    const rolId = parseInt(body.rolId);

    if (!nombre) {
        return { mensaje: 'El nombre es obligatorio' };
    }

    if (!FORMATO_EMAIL.test(email)) {
        return { mensaje: 'El email es obligatorio y debe tener un formato válido' };
    }

    if (!esEdicion && !contrasena) {
        return { mensaje: 'La contraseña es obligatoria' };
    }

    if (contrasena && contrasena.length < LARGO_MINIMO_CONTRASENA) {
        return {
            mensaje: `La contraseña debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres`
        };
    }

    if (!FORMATO_TELEFONO.test(telefono)) {
        return { mensaje: 'El teléfono es obligatorio y debe tener entre 6 y 20 caracteres' };
    }

    if (body.activo !== undefined && typeof body.activo !== 'boolean') {
        return { mensaje: 'El campo activo debe ser verdadero o falso' };
    }

    if (isNaN(rolId)) {
        return { mensaje: 'El rol es obligatorio' };
    }

    const datos = {
        nombre,
        email,
        telefono,
        rolId,
        activo: body.activo === undefined ? true : body.activo
    };

    // Sin contraseña nueva el campo ni siquiera viaja al `update`, así que Prisma
    // deja intacto el hash guardado.
    if (contrasena) {
        datos.contrasena = contrasena;
    }

    return { datos };
};

const listarUsuarios = async (req, res) => {
    try {
        // Se incluye el rol para que el listado del frontend pueda mostrar su
        // nombre sin tener que pedirlo usuario por usuario.
        const usuarios = await prisma.usuario.findMany({
            include: {
                rol: true
            }
        });

        res.json(usuarios.map(aRespuesta));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al listar los usuarios'
        });
    }
};

const crearUsuario = async (req, res) => {
    try {
        const { mensaje, datos } = validarDatos(req.body, false);

        if (mensaje) {
            return res.status(400).json({
                mensaje: mensaje
            });
        }

        const rol = await prisma.rol.findUnique({
            where: {
                id: datos.rolId
            }
        });

        // El rol llega en el cuerpo del request, así que un id inexistente es un
        // dato inválido del cliente (400) y no un recurso faltante en la URL (404).
        if (!rol) {
            return res.status(400).json({
                mensaje: 'El rol indicado no existe'
            });
        }

        const usuario = await prisma.usuario.create({
            data: {
                ...datos,
                contrasena: await bcrypt.hash(datos.contrasena, RONDAS_HASH)
            },
            include: {
                rol: true
            }
        });

        res.status(201).json(aRespuesta(usuario));
    } catch (error) {
        if (error.code === CODIGO_DUPLICADO) {
            return res.status(409).json({
                mensaje: 'Ya existe un usuario con ese email'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al crear el usuario'
        });
    }
};

const obtenerUsuario = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        const usuario = await prisma.usuario.findUnique({
            where: {
                id: id
            },
            include: {
                rol: true
            }
        });

        if (!usuario) {
            return res.status(404).json({
                mensaje: 'Usuario no encontrado'
            });
        }

        res.json(aRespuesta(usuario));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al obtener el usuario'
        });
    }
};

const actualizarUsuario = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        const { mensaje, datos } = validarDatos(req.body, true);

        if (mensaje) {
            return res.status(400).json({
                mensaje: mensaje
            });
        }

        const usuarioExistente = await prisma.usuario.findUnique({
            where: {
                id: id
            }
        });

        if (!usuarioExistente) {
            return res.status(404).json({
                mensaje: 'Usuario no encontrado'
            });
        }

        const rol = await prisma.rol.findUnique({
            where: {
                id: datos.rolId
            }
        });

        if (!rol) {
            return res.status(400).json({
                mensaje: 'El rol indicado no existe'
            });
        }

        if (datos.contrasena) {
            datos.contrasena = await bcrypt.hash(datos.contrasena, RONDAS_HASH);
        }

        const usuario = await prisma.usuario.update({
            where: {
                id: id
            },
            data: datos,
            include: {
                rol: true
            }
        });

        res.json(aRespuesta(usuario));
    } catch (error) {
        if (error.code === CODIGO_DUPLICADO) {
            return res.status(409).json({
                mensaje: 'Ya existe un usuario con ese email'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al actualizar el usuario'
        });
    }
};

const eliminarUsuario = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                mensaje: 'El id debe ser un número'
            });
        }

        const usuarioExistente = await prisma.usuario.findUnique({
            where: {
                id: id
            }
        });

        if (!usuarioExistente) {
            return res.status(404).json({
                mensaje: 'Usuario no encontrado'
            });
        }

        await prisma.usuario.delete({
            where: {
                id: id
            }
        });

        res.json({
            mensaje: 'Usuario eliminado correctamente'
        });
    } catch (error) {
        // Todavía no hay ninguna tabla apuntando a Usuario, pero Reserva lo va a
        // hacer: cuando exista, borrar un usuario con reservas tiene que avisar
        // que no se puede en vez de salir como un 500.
        if (error.code === CODIGO_CLAVE_FORANEA) {
            return res.status(409).json({
                mensaje: 'No se puede eliminar el usuario porque tiene reservas asociadas'
            });
        }

        console.error(error);

        res.status(500).json({
            mensaje: 'Error al eliminar el usuario'
        });
    }
};

module.exports = {
    listarUsuarios,
    crearUsuario,
    obtenerUsuario,
    actualizarUsuario,
    eliminarUsuario
};

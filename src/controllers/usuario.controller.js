const bcrypt = require('bcryptjs');

const prisma = require('../config/prisma');

const CODIGO_DUPLICADO = 'P2002';

const CODIGO_CLAVE_FORANEA = 'P2003';

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FORMATO_TELEFONO = /^\+?[\d\s()-]{6,20}$/;

const LARGO_MINIMO_CONTRASENA = 8;

const RONDAS_HASH = 10;

const normalizar = (texto) => (typeof texto === 'string' ? texto.trim() : '');

const aRespuesta = (usuario) => {
    const { contrasena, ...resto } = usuario;

    return resto;
};

const validarDatos = (body, esEdicion) => {
    const nombre = normalizar(body.nombre);
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

    if (contrasena) {
        datos.contrasena = contrasena;
    }

    return { datos };
};

const validarPerfil = (body) => {
    const nombre = normalizar(body.nombre);
    const email = normalizar(body.email).toLowerCase();
    const telefono = normalizar(body.telefono);

    if (!nombre) {
        return { mensaje: 'El nombre es obligatorio' };
    }

    if (!FORMATO_EMAIL.test(email)) {
        return { mensaje: 'El email es obligatorio y debe tener un formato válido' };
    }

    if (!FORMATO_TELEFONO.test(telefono)) {
        return { mensaje: 'El teléfono es obligatorio y debe tener entre 6 y 20 caracteres' };
    }

    return { datos: { nombre, email, telefono } };
};

const validarCambioDeContrasena = (body) => {
    const actual = typeof body.contrasenaActual === 'string' ? body.contrasenaActual : '';
    const nueva = typeof body.contrasenaNueva === 'string' ? body.contrasenaNueva : '';

    if (!actual) {
        return { mensaje: 'La contraseña actual es obligatoria' };
    }

    if (!nueva) {
        return { mensaje: 'La contraseña nueva es obligatoria' };
    }

    if (nueva.length < LARGO_MINIMO_CONTRASENA) {
        return {
            mensaje: `La contraseña debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres`
        };
    }

    if (nueva === actual) {
        return { mensaje: 'La contraseña nueva tiene que ser distinta de la actual' };
    }

    return { datos: { actual, nueva } };
};

const listarUsuarios = async (req, res) => {
    try {
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
    eliminarUsuario,
    validarDatos,
    validarPerfil,
    validarCambioDeContrasena,
    aRespuesta,
    RONDAS_HASH
};

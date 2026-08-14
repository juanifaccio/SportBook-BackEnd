const prisma = require('../config/prisma');

/**
 * Los roles son los niveles de acceso de la aplicación, no un catálogo que el
 * usuario final administre: se siembran en la migración que crea la tabla, así
 * que este controller solo los lista para que el formulario de usuario pueda
 * ofrecerlos en un selector. No hay alta, edición ni baja a propósito: borrar un
 * rol dejaría sin nivel de acceso a los usuarios que lo tienen asignado.
 */
const listarRoles = async (req, res) => {
    try {
        const roles = await prisma.rol.findMany();

        res.json(roles);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            mensaje: 'Error al listar los roles'
        });
    }
};

module.exports = {
    listarRoles
};

const prisma = require('../config/prisma');

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

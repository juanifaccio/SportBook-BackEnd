/**
 * Nombres de los roles que siembra la migración `crear_usuario_y_rol`.
 *
 * Son los dos niveles de acceso de la aplicación: ADMIN administra el complejo
 * (canchas, turnos, usuarios y todas las reservas) y CLIENTE reserva y gestiona
 * las suyas. Están acá y no como texto suelto en cada archivo para que el día que
 * se sume un rol el compilador de la cabeza no sea el único que se acuerde de
 * todos los lugares donde se lo compara.
 */
const ROLES = {
  ADMIN: 'ADMIN',
  CLIENTE: 'CLIENTE'
};

module.exports = ROLES;

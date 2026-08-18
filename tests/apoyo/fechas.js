// Fechas para los tests, sin nada de la aplicación detrás: lo usan tanto los
// tests unitarios como los de integración.

/**
 * Un día del calendario relativo a hoy, en formato "AAAA-MM-DD".
 *
 * Los tests se ubican respecto de hoy y no en fechas escritas a mano porque
 * buena parte de las reglas del negocio dependen de si el turno ya empezó: con
 * fechas fijas, la suite entera empezaría a fallar sola al pasar el tiempo.
 */
const diaRelativo = (dias) => {
  const fecha = new Date();

  fecha.setDate(fecha.getDate() + dias);

  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');

  return `${fecha.getFullYear()}-${mes}-${dia}`;
};

/**
 * Convierte "AAAA-MM-DD" al `Date` que devuelve Prisma para una columna DATE:
 * medianoche UTC. Es lo que reciben las funciones que trabajan con la fecha ya
 * leída de la base.
 */
const comoFechaDeBase = (dia) => new Date(`${dia}T00:00:00.000Z`);

module.exports = { diaRelativo, comoFechaDeBase };

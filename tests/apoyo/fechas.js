const diaRelativo = (dias) => {
  const fecha = new Date();

  fecha.setDate(fecha.getDate() + dias);

  return comoDia(fecha);
};

const comoDia = (fecha) => {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');

  return `${fecha.getFullYear()}-${mes}-${dia}`;
};

const comoFechaDeBase = (dia) => new Date(`${dia}T00:00:00.000Z`);

module.exports = { diaRelativo, comoDia, comoFechaDeBase };

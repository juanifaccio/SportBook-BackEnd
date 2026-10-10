const crearReq = (extra = {}) => ({
  headers: {},
  params: {},
  query: {},
  body: {},
  ...extra
});

const crearRes = () => {
  const res = {
    codigo: 200,
    cuerpo: undefined,
    respondio: false
  };

  res.status = (codigo) => {
    res.codigo = codigo;

    return res;
  };

  res.json = (cuerpo) => {
    res.cuerpo = cuerpo;
    res.respondio = true;

    return res;
  };

  return res;
};

const crearNext = () => {
  const next = () => {
    next.llamado = true;
  };

  next.llamado = false;

  return next;
};

module.exports = { crearReq, crearRes, crearNext };

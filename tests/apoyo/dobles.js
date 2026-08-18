// Dobles mínimos del `req` y el `res` de Express, para probar middlewares sin
// levantar el servidor. Solo implementan lo que el código bajo prueba usa:
// `status` encadenable y `json`, que dejan registrado con qué se respondió.

const crearReq = (extra = {}) => ({
  headers: {},
  params: {},
  query: {},
  body: {},
  ...extra
});

const crearRes = () => {
  const res = {
    // El código por defecto de Express cuando nadie llama a `status`.
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

/** `next` que se acuerda de si lo llamaron, para saber si el middleware dejó pasar. */
const crearNext = () => {
  const next = () => {
    next.llamado = true;
  };

  next.llamado = false;

  return next;
};

module.exports = { crearReq, crearRes, crearNext };

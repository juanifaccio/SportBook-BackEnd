const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { validarDatos, armarFiltro, aRespuesta } = require('../../src/controllers/cancha.controller');

const cuerpo = (cambios = {}) => ({
  nombre: 'Cancha 1',
  precioPorHora: 12000,
  estado: 'DISPONIBLE',
  tipoCanchaId: 2,
  ...cambios
});

describe('cancha: validación', () => {
  describe('validarDatos', () => {
    it('acepta una cancha bien formada', () => {
      assert.deepEqual(validarDatos(cuerpo()), {
        datos: { nombre: 'Cancha 1', precioPorHora: 12000, estado: 'DISPONIBLE', tipoCanchaId: 2 }
      });
    });

    it('recorta los espacios del nombre', () => {
      assert.equal(validarDatos(cuerpo({ nombre: '  Cancha 1  ' })).datos.nombre, 'Cancha 1');
    });

    it('rechaza la cancha sin nombre', () => {
      assert.match(validarDatos(cuerpo({ nombre: '' })).mensaje, /nombre/);
    });

    it('rechaza un nombre que es solo espacios', () => {
      assert.match(validarDatos(cuerpo({ nombre: '   ' })).mensaje, /nombre/);
    });

    it('acepta el precio y el tipo como texto, que es como llegan del formulario', () => {
      const { datos } = validarDatos(cuerpo({ precioPorHora: '9500.50', tipoCanchaId: '4' }));

      assert.equal(datos.precioPorHora, 9500.5);
      assert.equal(datos.tipoCanchaId, 4);
    });

    it('rechaza un precio que no es un número', () => {
      assert.match(validarDatos(cuerpo({ precioPorHora: 'gratis' })).mensaje, /precio/);
    });

    it('rechaza un precio de cero o negativo', () => {
      assert.match(validarDatos(cuerpo({ precioPorHora: 0 })).mensaje, /mayor a cero/);
      assert.match(validarDatos(cuerpo({ precioPorHora: -100 })).mensaje, /mayor a cero/);
    });

    it('acepta los dos estados del enum', () => {
      assert.equal(validarDatos(cuerpo({ estado: 'MANTENIMIENTO' })).datos.estado, 'MANTENIMIENTO');
      assert.equal(validarDatos(cuerpo({ estado: 'DISPONIBLE' })).datos.estado, 'DISPONIBLE');
    });

    it('rechaza un estado que no está en el enum', () => {
      assert.match(validarDatos(cuerpo({ estado: 'ROTA' })).mensaje, /DISPONIBLE o MANTENIMIENTO/);
    });

    it('rechaza el estado en minúsculas', () => {
      assert.match(validarDatos(cuerpo({ estado: 'disponible' })).mensaje, /DISPONIBLE o MANTENIMIENTO/);
    });

    it('rechaza la cancha sin tipo', () => {
      assert.match(validarDatos(cuerpo({ tipoCanchaId: undefined })).mensaje, /tipo de cancha/);
    });
  });

  describe('armarFiltro', () => {
    it('sin filtros devuelve un where vacío', () => {
      assert.deepEqual(armarFiltro({}), { filtro: {} });
    });

    it('acepta el tipo como texto y lo convierte a número', () => {
      assert.deepEqual(armarFiltro({ tipoCanchaId: '3' }), { filtro: { tipoCanchaId: 3 } });
    });

    it('rechaza un tipo que no es un número', () => {
      assert.match(armarFiltro({ tipoCanchaId: 'futbol' }).mensaje, /tipo de cancha/);
    });

    it('acepta un id de tipo que puede no existir', () => {
      assert.deepEqual(armarFiltro({ tipoCanchaId: '9999' }), { filtro: { tipoCanchaId: 9999 } });
    });

    it('ignora las claves de la query que no son filtros', () => {
      assert.deepEqual(armarFiltro({ estado: 'DISPONIBLE', orden: 'precio' }), { filtro: {} });
    });
  });

  describe('aRespuesta', () => {
    it('convierte el precio a número', () => {
      assert.equal(aRespuesta({ id: 1, precioPorHora: '12000.00' }).precioPorHora, 12000);
    });

    it('deja el resto de los campos como estaban', () => {
      const cancha = { id: 1, nombre: 'Cancha 1', precioPorHora: '12000.00', estado: 'DISPONIBLE' };

      assert.equal(aRespuesta(cancha).nombre, 'Cancha 1');
      assert.equal(aRespuesta(cancha).estado, 'DISPONIBLE');
    });
  });
});

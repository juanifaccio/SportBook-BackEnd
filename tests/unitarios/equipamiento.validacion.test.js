const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { validarDatos, aRespuesta } = require('../../src/controllers/equipamiento.controller');

const cuerpo = (cambios = {}) => ({
  nombre: 'Pelota de fútbol',
  descripcion: 'Número 5, de cuero sintético',
  precio: 1500,
  stock: 10,
  ...cambios
});

describe('equipamiento: validación', () => {
  describe('validarDatos', () => {
    it('acepta un equipamiento bien formado', () => {
      assert.deepEqual(validarDatos(cuerpo()), {
        datos: {
          nombre: 'Pelota de fútbol',
          descripcion: 'Número 5, de cuero sintético',
          precio: 1500,
          stock: 10
        }
      });
    });

    it('recorta los espacios del nombre y de la descripción', () => {
      const { datos } = validarDatos(cuerpo({ nombre: '  Pelota  ', descripcion: '  Número 5  ' }));

      assert.equal(datos.nombre, 'Pelota');
      assert.equal(datos.descripcion, 'Número 5');
    });

    it('rechaza el equipamiento sin nombre', () => {
      assert.match(validarDatos(cuerpo({ nombre: '' })).mensaje, /nombre/);
    });

    it('rechaza un nombre que es solo espacios', () => {
      assert.match(validarDatos(cuerpo({ nombre: '   ' })).mensaje, /nombre/);
    });

    it('rechaza el equipamiento sin descripción', () => {
      assert.match(validarDatos(cuerpo({ descripcion: '' })).mensaje, /descripción/);
    });

    it('acepta el precio y el stock como texto, que es como llegan del formulario', () => {
      const { datos } = validarDatos(cuerpo({ precio: '1250.50', stock: '4' }));

      assert.equal(datos.precio, 1250.5);
      assert.equal(datos.stock, 4);
    });

    it('rechaza un precio que no es un número', () => {
      assert.match(validarDatos(cuerpo({ precio: 'gratis' })).mensaje, /precio/);
    });

    it('rechaza un precio de cero o negativo', () => {
      assert.match(validarDatos(cuerpo({ precio: 0 })).mensaje, /mayor a cero/);
      assert.match(validarDatos(cuerpo({ precio: -100 })).mensaje, /mayor a cero/);
    });

    it('acepta un stock de cero', () => {
      assert.equal(validarDatos(cuerpo({ stock: 0 })).datos.stock, 0);
    });

    it('rechaza un stock negativo', () => {
      assert.match(validarDatos(cuerpo({ stock: -1 })).mensaje, /mayor o igual a cero/);
    });

    it('rechaza un stock con decimales', () => {
      assert.match(validarDatos(cuerpo({ stock: 2.5 })).mensaje, /entero/);
    });

    it('rechaza un stock que no es un número', () => {
      assert.match(validarDatos(cuerpo({ stock: 'varias' })).mensaje, /stock/);
    });
  });

  describe('aRespuesta', () => {
    it('convierte el precio a número', () => {
      assert.equal(aRespuesta({ id: 1, precio: '1500.00' }).precio, 1500);
    });

    it('deja el resto de los campos como estaban', () => {
      const equipamiento = { id: 1, nombre: 'Pelota', descripcion: 'Número 5', precio: '1500.00', stock: 10 };

      assert.equal(aRespuesta(equipamiento).nombre, 'Pelota');
      assert.equal(aRespuesta(equipamiento).stock, 10);
    });
  });
});

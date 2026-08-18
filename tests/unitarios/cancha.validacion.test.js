const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { validarDatos, aRespuesta } = require('../../src/controllers/cancha.controller');

const cuerpo = (cambios = {}) => ({
  nombre: 'Cancha 1',
  precioPorHora: 12000,
  estado: 'DISPONIBLE',
  tipoCanchaId: 2,
  ...cambios
});

describe('cancha — validación', () => {
  describe('validarDatos', () => {
    it('acepta una cancha bien formada', () => {
      assert.deepEqual(validarDatos(cuerpo()), {
        datos: { nombre: 'Cancha 1', precioPorHora: 12000, estado: 'DISPONIBLE', tipoCanchaId: 2 }
      });
    });

    // El `trim` no es cosmético: la colación de la base ignora los espacios al
    // final pero no los del principio, así que sin esto una " Cancha 1" pasaría
    // el índice único y quedarían dos canchas con el mismo nombre.
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

    // Una cancha a precio cero o negativo daría reservas por cero pesos: el
    // total de la reserva se calcula multiplicando este precio.
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

  describe('aRespuesta', () => {
    // Prisma devuelve el Decimal como string y el frontend lo necesita como
    // número para formatearlo y multiplicarlo.
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

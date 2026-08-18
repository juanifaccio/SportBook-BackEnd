const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { validarDatos, aRespuesta } = require('../../src/controllers/horario.controller');
const { comoFechaDeBase } = require('../apoyo/fechas');

/** Cuerpo válido de un turno. Cada test rompe un campo y deja el resto en pie. */
const cuerpo = (cambios = {}) => ({
  fecha: '2026-09-15',
  horaInicio: '10:00',
  horaFin: '11:00',
  canchaId: 3,
  ...cambios
});

describe('horario — validación del turno', () => {
  describe('validarDatos', () => {
    it('acepta un turno bien formado y lo devuelve normalizado', () => {
      assert.deepEqual(validarDatos(cuerpo()), {
        datos: {
          fecha: new Date('2026-09-15'),
          horaInicio: '10:00',
          horaFin: '11:00',
          canchaId: 3,
          disponible: true
        }
      });
    });

    // Un turno nace libre; se marca ocupado recién cuando alguien lo reserva.
    it('deja el turno disponible cuando no se dice lo contrario', () => {
      assert.equal(validarDatos(cuerpo()).datos.disponible, true);
    });

    it('respeta el disponible que llega en el cuerpo', () => {
      assert.equal(validarDatos(cuerpo({ disponible: false })).datos.disponible, false);
    });

    it('acepta el id de la cancha como texto, que es como llega del formulario', () => {
      assert.equal(validarDatos(cuerpo({ canchaId: '7' })).datos.canchaId, 7);
    });

    it('recorta los espacios de los campos de texto', () => {
      const { datos } = validarDatos(cuerpo({ fecha: ' 2026-09-15 ', horaInicio: ' 10:00 ' }));

      assert.equal(datos.horaInicio, '10:00');
      assert.deepEqual(datos.fecha, new Date('2026-09-15'));
    });

    it('rechaza el turno sin fecha', () => {
      assert.match(validarDatos(cuerpo({ fecha: '' })).mensaje, /fecha/);
    });

    it('rechaza una fecha en otro formato', () => {
      assert.match(validarDatos(cuerpo({ fecha: '15/09/2026' })).mensaje, /AAAA-MM-DD/);
    });

    // El caso que no alcanza a detectar el formato ni `isNaN`: `Date` acepta el
    // 31 de febrero y lo corre al 3 de marzo, así que un turno cargado para un
    // día que no existe quedaría guardado en otro.
    it('rechaza un día que no existe en el calendario', () => {
      assert.match(validarDatos(cuerpo({ fecha: '2026-02-31' })).mensaje, /AAAA-MM-DD/);
    });

    it('acepta el 29 de febrero de un año bisiesto', () => {
      assert.deepEqual(validarDatos(cuerpo({ fecha: '2028-02-29' })).datos.fecha, new Date('2028-02-29'));
    });

    it('rechaza una hora que no existe en el reloj', () => {
      assert.match(validarDatos(cuerpo({ horaInicio: '25:00' })).mensaje, /HH:mm/);
      assert.match(validarDatos(cuerpo({ horaFin: '10:75' })).mensaje, /HH:mm/);
    });

    it('rechaza una hora sin el cero adelante', () => {
      assert.match(validarDatos(cuerpo({ horaInicio: '9:00' })).mensaje, /HH:mm/);
    });

    it('rechaza el turno que termina antes de empezar', () => {
      assert.match(validarDatos(cuerpo({ horaInicio: '11:00', horaFin: '10:00' })).mensaje, /posterior/);
    });

    it('rechaza el turno de duración cero', () => {
      assert.match(validarDatos(cuerpo({ horaFin: '10:00' })).mensaje, /posterior/);
    });

    it('rechaza el turno sin cancha', () => {
      assert.match(validarDatos(cuerpo({ canchaId: undefined })).mensaje, /cancha/);
    });

    it('rechaza un disponible que no es booleano', () => {
      assert.match(validarDatos(cuerpo({ disponible: 'true' })).mensaje, /verdadero o falso/);
    });
  });

  describe('aRespuesta', () => {
    // Prisma devuelve la columna DATE como un DateTime a medianoche UTC: sin
    // recortarla, el cliente recibiría un día distinto del que cargó.
    it('recorta la fecha al día que se guardó', () => {
      const horario = { id: 1, fecha: comoFechaDeBase('2026-09-15'), horaInicio: '10:00' };

      assert.equal(aRespuesta(horario).fecha, '2026-09-15');
    });

    it('convierte el precio de la cancha incluida a número', () => {
      const horario = {
        id: 1,
        fecha: comoFechaDeBase('2026-09-15'),
        cancha: { id: 3, precioPorHora: '12000.00' }
      };

      assert.equal(aRespuesta(horario).cancha.precioPorHora, 12000);
    });

    it('no rompe cuando el turno viene sin la cancha', () => {
      const horario = { id: 1, fecha: comoFechaDeBase('2026-09-15') };

      assert.equal(aRespuesta(horario).cancha, undefined);
    });
  });
});

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { validarDatos, validarCambioConReserva, aRespuesta } = require('../../src/controllers/horario.controller');
const { comoFechaDeBase } = require('../apoyo/fechas');

const cuerpo = (cambios = {}) => ({
  fecha: '2026-09-15',
  horaInicio: '10:00',
  horaFin: '11:00',
  canchaId: 3,
  ...cambios
});

describe('horario: validación del turno', () => {
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

  describe('validarCambioConReserva', () => {
    const reservado = {
      id: 1,
      fecha: comoFechaDeBase('2026-09-15'),
      horaInicio: '10:00',
      horaFin: '11:00',
      canchaId: 3,
      disponible: false
    };

    const cambio = (cambios = {}) => validarDatos(cuerpo({ disponible: false, ...cambios })).datos;

    it('deja guardarlo sin cambios', () => {
      assert.deepEqual(validarCambioConReserva(reservado, cambio()), {});
    });

    it('rechaza volver a ofrecerlo', () => {
      assert.match(validarCambioConReserva(reservado, cambio({ disponible: true })).mensaje, /volver a ofrecer/);
    });

    it('rechaza guardarlo sin decir que sigue ocupado', () => {
      const datos = validarDatos(cuerpo()).datos;

      assert.match(validarCambioConReserva(reservado, datos).mensaje, /volver a ofrecer/);
    });

    it('rechaza moverlo de día', () => {
      assert.match(validarCambioConReserva(reservado, cambio({ fecha: '2026-09-16' })).mensaje, /cambiar de día/);
    });

    it('rechaza moverlo de hora', () => {
      assert.match(
        validarCambioConReserva(reservado, cambio({ horaInicio: '10:30', horaFin: '11:30' })).mensaje,
        /cambiar de día/
      );
    });

    it('rechaza estirarlo o acortarlo', () => {
      assert.match(validarCambioConReserva(reservado, cambio({ horaFin: '11:30' })).mensaje, /cambiar de día/);
    });

    it('rechaza pasarlo a otra cancha', () => {
      assert.match(validarCambioConReserva(reservado, cambio({ canchaId: 4 })).mensaje, /cambiar de día/);
    });
  });

  describe('aRespuesta', () => {
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

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  generarTurnos,
  seSolapan,
  validarLote
} = require('../../src/controllers/horario.controller');

const cuerpo = (cambios = {}) => ({
  fecha: '2026-09-15',
  horaInicio: '08:00',
  horaFin: '12:00',
  canchaId: 3,
  duracion: 60,
  ...cambios
});

describe('horario: generación de turnos en lote', () => {
  describe('generarTurnos', () => {
    it('parte el rango en turnos consecutivos de la duración pedida', () => {
      assert.deepEqual(generarTurnos('08:00', '11:00', 60), [
        { horaInicio: '08:00', horaFin: '09:00' },
        { horaInicio: '09:00', horaFin: '10:00' },
        { horaInicio: '10:00', horaFin: '11:00' }
      ]);
    });

    it('deja cada turno pegado al anterior, sin huecos', () => {
      const turnos = generarTurnos('09:00', '12:00', 45);

      turnos.slice(1).forEach((turno, indice) => {
        assert.equal(turno.horaInicio, turnos[indice].horaFin);
      });
    });

    it('descarta el último turno cuando no entra completo', () => {
      const turnos = generarTurnos('08:00', '13:00', 90);

      assert.equal(turnos.length, 3);
      assert.equal(turnos.at(-1).horaFin, '12:30');
    });

    it('devuelve un solo turno cuando el rango mide exactamente la duración', () => {
      assert.deepEqual(generarTurnos('20:00', '21:30', 90), [
        { horaInicio: '20:00', horaFin: '21:30' }
      ]);
    });

    it('no genera ninguno cuando el rango es más corto que la duración', () => {
      assert.deepEqual(generarTurnos('10:00', '11:00', 90), []);
    });

    it('mantiene el cero a la izquierda y los minutos en las horas generadas', () => {
      assert.deepEqual(generarTurnos('08:15', '09:15', 30), [
        { horaInicio: '08:15', horaFin: '08:45' },
        { horaInicio: '08:45', horaFin: '09:15' }
      ]);
    });

    it('no se pasa del final del día', () => {
      const turnos = generarTurnos('22:00', '23:59', 60);

      assert.equal(turnos.length, 1);
      assert.equal(turnos.at(-1).horaFin, '23:00');
    });
  });

  describe('seSolapan', () => {
    it('detecta el turno que arranca en el medio de otro', () => {
      assert.equal(
        seSolapan({ horaInicio: '10:00', horaFin: '11:00' }, { horaInicio: '10:30', horaFin: '11:30' }),
        true
      );
    });

    it('detecta el turno que contiene a otro', () => {
      assert.equal(
        seSolapan({ horaInicio: '10:00', horaFin: '12:00' }, { horaInicio: '10:30', horaFin: '11:00' }),
        true
      );
    });

    it('detecta el mismo turno cargado dos veces', () => {
      assert.equal(
        seSolapan({ horaInicio: '10:00', horaFin: '11:00' }, { horaInicio: '10:00', horaFin: '11:00' }),
        true
      );
    });

    it('no considera solapados a dos turnos que se tocan en el borde', () => {
      assert.equal(
        seSolapan({ horaInicio: '10:00', horaFin: '11:00' }, { horaInicio: '11:00', horaFin: '12:00' }),
        false
      );
    });

    it('no considera solapados a dos turnos separados', () => {
      assert.equal(
        seSolapan({ horaInicio: '08:00', horaFin: '09:00' }, { horaInicio: '18:00', horaFin: '19:00' }),
        false
      );
    });
  });

  describe('validarLote', () => {
    it('acepta un lote bien formado y devuelve los turnos a crear', () => {
      const { datos } = validarLote(cuerpo());

      assert.equal(datos.canchaId, 3);
      assert.deepEqual(datos.fecha, new Date('2026-09-15'));
      assert.equal(datos.turnos.length, 4);
      assert.deepEqual(datos.turnos[0], { horaInicio: '08:00', horaFin: '09:00' });
    });

    it('acepta la duración como texto, que es como llega del formulario', () => {
      assert.equal(validarLote(cuerpo({ duracion: '30' })).datos.turnos.length, 8);
    });

    it('aplica al lote las mismas reglas de fecha y horas que un turno suelto', () => {
      assert.match(validarLote(cuerpo({ fecha: '15/09/2026' })).mensaje, /AAAA-MM-DD/);
      assert.match(validarLote(cuerpo({ horaInicio: '8' })).mensaje, /HH:mm/);
      assert.match(validarLote(cuerpo({ horaFin: '07:00' })).mensaje, /posterior/);
      assert.match(validarLote(cuerpo({ canchaId: undefined })).mensaje, /cancha/);
    });

    it('rechaza el lote sin duración', () => {
      assert.match(validarLote(cuerpo({ duracion: undefined })).mensaje, /duración/);
    });

    it('rechaza una duración menor al mínimo', () => {
      assert.match(validarLote(cuerpo({ duracion: 5 })).mensaje, /15 y 480/);
    });

    it('rechaza una duración mayor al máximo', () => {
      assert.match(validarLote(cuerpo({ duracion: 600 })).mensaje, /15 y 480/);
    });

    it('rechaza una duración negativa, que generaría turnos para siempre', () => {
      assert.match(validarLote(cuerpo({ duracion: -60 })).mensaje, /15 y 480/);
    });

    it('rechaza el rango más corto que la duración del turno', () => {
      assert.match(validarLote(cuerpo({ horaFin: '08:30', duracion: 60 })).mensaje, /más corto/);
    });
  });
});

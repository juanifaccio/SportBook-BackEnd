const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  minutosDe,
  precioDe,
  yaEmpezo,
  validarTurno,
  datosDelTurno,
  armarFiltro,
  aRespuesta
} = require('../../src/controllers/reserva.controller');
const { diaRelativo, comoDia, comoFechaDeBase } = require('../apoyo/fechas');

const MANANA = diaRelativo(1);
const AYER = diaRelativo(-1);

/** Turno tal como lo devuelve Prisma, con la cancha incluida. */
const turno = (cambios = {}) => ({
  id: 7,
  fecha: comoFechaDeBase(MANANA),
  horaInicio: '10:00',
  horaFin: '11:00',
  canchaId: 3,
  disponible: true,
  ...cambios,
  cancha: {
    id: 3,
    nombre: 'Cancha 1',
    precioPorHora: 12000,
    estado: 'DISPONIBLE',
    ...cambios.cancha
  }
});

describe('reserva — reglas del negocio', () => {
  describe('minutosDe', () => {
    it('pasa la hora del reloj a minutos desde la medianoche', () => {
      assert.equal(minutosDe('00:00'), 0);
      assert.equal(minutosDe('10:00'), 600);
      assert.equal(minutosDe('09:30'), 570);
      assert.equal(minutosDe('23:59'), 1439);
    });
  });

  describe('precioDe', () => {
    it('cobra el precio por hora en un turno de una hora', () => {
      assert.equal(precioDe(turno()), 12000);
    });

    it('cobra la fracción en un turno de una hora y media', () => {
      assert.equal(precioDe(turno({ horaFin: '11:30' })), 18000);
    });

    it('cobra media hora a mitad de precio', () => {
      assert.equal(precioDe(turno({ horaFin: '10:30' })), 6000);
    });

    // Prisma devuelve los Decimal como string, así que el precio llega como texto
    // y multiplicarlo sin convertirlo daría NaN.
    it('acepta el precio como el string que devuelve Prisma', () => {
      assert.equal(precioDe(turno({ cancha: { precioPorHora: '12000.00' } })), 12000);
    });

    // El total va a una columna Decimal(10, 2): sin redondear acá, el tercer
    // decimal lo terminaría resolviendo la base por su cuenta.
    it('redondea a dos decimales', () => {
      assert.equal(precioDe(turno({ horaFin: '11:30', cancha: { precioPorHora: '3333.33' } })), 5000);
    });
  });

  describe('yaEmpezo', () => {
    it('reconoce un turno de ayer', () => {
      assert.equal(yaEmpezo(comoFechaDeBase(AYER), '10:00'), true);
    });

    it('reconoce un turno de mañana', () => {
      assert.equal(yaEmpezo(comoFechaDeBase(MANANA), '10:00'), false);
    });

    // La fecha se guarda como DATE (medianoche UTC) y la hora aparte, así que hay
    // que rearmar el instante en hora local: la del complejo es la que decide si
    // el turno todavía sirve.
    it('compone el instante en hora local, no en UTC', () => {
      // La hora siguiente en punto, con el día que le corresponde: a las 23 y
      // pico esa hora cae en el día de mañana, y tomar el de hoy dejaba el turno
      // 23 horas en el pasado. El test fallaba solo entre las 23:00 y la
      // medianoche, que es la única franja en la que la suma cambia de día.
      const dentroDeUnRato = new Date(Date.now() + 60 * 60 * 1000);
      const hora = `${String(dentroDeUnRato.getHours()).padStart(2, '0')}:00`;

      assert.equal(yaEmpezo(comoFechaDeBase(comoDia(dentroDeUnRato)), hora), false);
    });
  });

  describe('validarTurno', () => {
    it('acepta un turno futuro de una cancha disponible', () => {
      assert.deepEqual(validarTurno(turno()), {});
    });

    it('rechaza con 409 el turno de una cancha en mantenimiento', () => {
      const { codigo, mensaje } = validarTurno(turno({ cancha: { estado: 'MANTENIMIENTO' } }));

      assert.equal(codigo, 409);
      assert.match(mensaje, /mantenimiento/);
    });

    it('rechaza con 400 un turno que ya empezó', () => {
      const { codigo, mensaje } = validarTurno(turno({ fecha: comoFechaDeBase(AYER) }));

      assert.equal(codigo, 400);
      assert.match(mensaje, /ya empezó/);
    });

    // Las dos reglas pueden fallar a la vez y el mensaje es distinto, así que el
    // orden en el que se comprueban es parte de lo que se responde.
    it('informa el mantenimiento antes que la fecha', () => {
      const invalido = validarTurno(
        turno({ fecha: comoFechaDeBase(AYER), cancha: { estado: 'MANTENIMIENTO' } })
      );

      assert.equal(invalido.codigo, 409);
    });
  });

  describe('datosDelTurno', () => {
    // Son una copia y no una lectura de la relación: la reserva es un registro
    // histórico y editar el turno después no tiene que reescribirla. Por eso al
    // reprogramar hay que volver a copiarlos todos y no solo el `horarioId`.
    it('copia del turno todo lo que la reserva guarda por su cuenta', () => {
      assert.deepEqual(datosDelTurno(turno()), {
        fecha: comoFechaDeBase(MANANA),
        horaInicio: '10:00',
        horaFin: '11:00',
        canchaId: 3,
        horarioId: 7,
        precioTotal: 12000
      });
    });
  });

  describe('armarFiltro', () => {
    it('no filtra nada sin query params', () => {
      assert.deepEqual(armarFiltro({}), { filtro: {} });
    });

    it('acepta los ids como números', () => {
      assert.deepEqual(armarFiltro({ usuarioId: '4', canchaId: '2' }), {
        filtro: { usuarioId: 4, canchaId: 2 }
      });
    });

    it('rechaza un id que no es un número', () => {
      assert.match(armarFiltro({ usuarioId: 'pepe' }).mensaje, /usuarioId/);
      assert.match(armarFiltro({ canchaId: 'x' }).mensaje, /canchaId/);
    });

    it('convierte la fecha a Date', () => {
      assert.deepEqual(armarFiltro({ fecha: '2026-08-18' }).filtro.fecha, new Date('2026-08-18'));
    });

    it('rechaza una fecha con otro formato', () => {
      assert.match(armarFiltro({ fecha: '18/08/2026' }).mensaje, /AAAA-MM-DD/);
    });

    it('acepta los estados del enum', () => {
      assert.deepEqual(armarFiltro({ estado: 'CANCELADA' }), { filtro: { estado: 'CANCELADA' } });
    });

    it('rechaza un estado que no existe', () => {
      assert.match(armarFiltro({ estado: 'ANULADA' }).mensaje, /PENDIENTE, CONFIRMADA, CANCELADA/);
    });

    it('ignora los query params que no son filtros', () => {
      assert.deepEqual(armarFiltro({ ordenar: 'fecha' }), { filtro: {} });
    });
  });

  describe('aRespuesta', () => {
    const reserva = {
      id: 1,
      fecha: comoFechaDeBase(MANANA),
      horaInicio: '10:00',
      horaFin: '11:00',
      estado: 'CONFIRMADA',
      precioTotal: '12000.00',
      usuarioId: 5,
      canchaId: 3,
      horarioId: 7
    };

    it('recorta la fecha al día que mandó el cliente', () => {
      assert.equal(aRespuesta(reserva).fecha, MANANA);
    });

    it('convierte el Decimal a número', () => {
      assert.equal(aRespuesta(reserva).precioTotal, 12000);
    });

    // El usuario viaja anidado dentro de la reserva, donde el controller de
    // usuarios no puede hacer nada por él: sin sacarla acá, el hash de bcrypt
    // saldría en cada listado de reservas.
    it('saca la contraseña del usuario incluido', () => {
      const conUsuario = aRespuesta({
        ...reserva,
        usuario: { id: 5, nombre: 'Lucía', email: 'lucia@ejemplo.com', contrasena: '$2b$10$hash' }
      });

      assert.equal('contrasena' in conUsuario.usuario, false);
      assert.equal(conUsuario.usuario.nombre, 'Lucía');
    });

    it('convierte también el precio por hora de la cancha incluida', () => {
      const conCancha = aRespuesta({ ...reserva, cancha: { id: 3, precioPorHora: '12000.00' } });

      assert.equal(conCancha.cancha.precioPorHora, 12000);
    });

    it('recorta la fecha del horario incluido', () => {
      const conHorario = aRespuesta({ ...reserva, horario: { id: 7, fecha: comoFechaDeBase(MANANA) } });

      assert.equal(conHorario.horario.fecha, MANANA);
    });

    it('no rompe cuando la reserva viene sin relaciones', () => {
      const plana = aRespuesta(reserva);

      assert.equal(plana.usuario, undefined);
      assert.equal(plana.cancha, undefined);
      assert.equal(plana.horario, undefined);
    });
  });
});

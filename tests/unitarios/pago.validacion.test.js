const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { validarDatos, armarFiltro, aRespuesta } = require('../../src/controllers/pago.controller');
const { saldoDe, estadoSegunPagos } = require('../../src/controllers/reserva.controller');

const cuerpo = (cambios = {}) => ({
  monto: 8000,
  metodo: 'EFECTIVO',
  ...cambios
});

describe('pago — validación', () => {
  describe('validarDatos', () => {
    it('acepta un pago bien formado', () => {
      assert.deepEqual(validarDatos(cuerpo()), {
        datos: { monto: 8000, metodo: 'EFECTIVO' }
      });
    });

    it('acepta el monto como texto, que es como llega del formulario', () => {
      assert.equal(validarDatos(cuerpo({ monto: '4500.50' })).datos.monto, 4500.5);
    });

    it('rechaza un monto que no es un número', () => {
      assert.match(validarDatos(cuerpo({ monto: 'gratis' })).mensaje, /monto/);
    });

    // Un pago de cero no es un pago, y uno negativo sería una devolución, que el
    // sistema no hace.
    it('rechaza un monto de cero o negativo', () => {
      assert.match(validarDatos(cuerpo({ monto: 0 })).mensaje, /mayor a cero/);
      assert.match(validarDatos(cuerpo({ monto: -100 })).mensaje, /mayor a cero/);
    });

    it('acepta los tres métodos del enum', () => {
      for (const metodo of ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']) {
        assert.equal(validarDatos(cuerpo({ metodo })).mensaje, undefined);
      }
    });

    it('rechaza un método que no está en el enum', () => {
      assert.match(validarDatos(cuerpo({ metodo: 'TRUEQUE' })).mensaje, /EFECTIVO/);
    });

    it('rechaza el método en minúsculas', () => {
      assert.match(validarDatos(cuerpo({ metodo: 'efectivo' })).mensaje, /EFECTIVO/);
    });

    // La fecha la pone el servidor —un pago se registra cuando se cobra— y el
    // estado nace REGISTRADO.
    it('descarta la fecha y el estado aunque vengan en el cuerpo', () => {
      const { datos } = validarDatos(cuerpo({ fecha: '2020-01-01', estado: 'ANULADO' }));

      assert.equal(datos.fecha, undefined);
      assert.equal(datos.estado, undefined);
    });
  });

  describe('armarFiltro', () => {
    it('sin query no filtra nada', () => {
      assert.deepEqual(armarFiltro({}), { filtro: {} });
    });

    it('filtra por reserva y por estado', () => {
      assert.deepEqual(armarFiltro({ reservaId: '4', estado: 'ANULADO' }), {
        filtro: { reservaId: 4, estado: 'ANULADO' }
      });
    });

    it('rechaza una reserva que no es un número', () => {
      assert.match(armarFiltro({ reservaId: 'pepe' }).mensaje, /debe ser un número/);
    });

    it('rechaza un estado que no está en el enum', () => {
      assert.match(armarFiltro({ estado: 'BASURA' }).mensaje, /REGISTRADO/);
    });
  });

  describe('saldoDe', () => {
    const pago = (monto, estado = 'REGISTRADO') => ({ monto, estado });

    it('sin pagos, el saldo es el precio entero', () => {
      assert.equal(saldoDe(12000, []), 12000);
    });

    it('descuenta los pagos registrados', () => {
      assert.equal(saldoDe(12000, [pago(5000), pago(3000)]), 4000);
    });

    // Anular un pago lo saca de la cuenta: es lo que permite que una reserva
    // vuelva a PENDIENTE.
    it('no cuenta los pagos anulados', () => {
      assert.equal(saldoDe(12000, [pago(5000), pago(7000, 'ANULADO')]), 7000);
    });

    it('llega a cero cuando lo pagado cubre el total', () => {
      assert.equal(saldoDe(12000, [pago(12000)]), 0);
    });

    // Los montos llegan de Prisma como Decimal, que se serializa a string.
    it('suma montos que vienen como texto', () => {
      assert.equal(saldoDe('12000.00', [pago('4000.00')]), 8000);
    });

    it('sin la lista de pagos lo trata como si no hubiera ninguno', () => {
      assert.equal(saldoDe(12000), 12000);
    });
  });

  describe('estadoSegunPagos', () => {
    const reserva = (estado = 'PENDIENTE', precioTotal = 12000) => ({ estado, precioTotal });

    it('sin pagos queda PENDIENTE', () => {
      assert.equal(estadoSegunPagos(reserva(), []), 'PENDIENTE');
    });

    it('con un pago parcial sigue PENDIENTE', () => {
      assert.equal(estadoSegunPagos(reserva(), [{ monto: 5000, estado: 'REGISTRADO' }]), 'PENDIENTE');
    });

    it('pasa a CONFIRMADA cuando lo pagado cubre el total', () => {
      assert.equal(
        estadoSegunPagos(reserva(), [{ monto: 12000, estado: 'REGISTRADO' }]),
        'CONFIRMADA'
      );
    });

    it('vuelve a PENDIENTE si el único pago se anula', () => {
      assert.equal(
        estadoSegunPagos(reserva('CONFIRMADA'), [{ monto: 12000, estado: 'ANULADO' }]),
        'PENDIENTE'
      );
    });

    // Cancelar es una decisión, no algo que se derive de la plata: una reserva
    // cancelada no vuelve sola por tener sus pagos en orden.
    it('una reserva cancelada se queda cancelada', () => {
      assert.equal(
        estadoSegunPagos(reserva('CANCELADA'), [{ monto: 12000, estado: 'REGISTRADO' }]),
        'CANCELADA'
      );
    });

    // Puede pasar al reprogramar una reserva ya paga a un turno más barato: no
    // hay nada que devolver, así que se da por cubierta.
    it('un saldo negativo cuenta como paga', () => {
      assert.equal(
        estadoSegunPagos(reserva('CONFIRMADA', 8000), [{ monto: 12000, estado: 'REGISTRADO' }]),
        'CONFIRMADA'
      );
    });
  });

  describe('aRespuesta', () => {
    const pago = {
      id: 1,
      monto: '8000.00',
      fecha: new Date('2026-08-20T00:00:00.000Z'),
      metodo: 'EFECTIVO',
      estado: 'REGISTRADO',
      reservaId: 5
    };

    it('convierte el monto a número y la fecha a AAAA-MM-DD', () => {
      const respuesta = aRespuesta(pago);

      assert.equal(respuesta.monto, 8000);
      assert.equal(respuesta.fecha, '2026-08-20');
    });

    it('deja el resto de los campos como estaban', () => {
      const respuesta = aRespuesta(pago);

      assert.equal(respuesta.metodo, 'EFECTIVO');
      assert.equal(respuesta.estado, 'REGISTRADO');
    });

    it('no se rompe si el pago viene sin su reserva', () => {
      assert.equal(aRespuesta(pago).reserva, undefined);
    });
  });
});

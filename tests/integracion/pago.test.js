const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../../src/app');
const { prisma, verificarBaseDePrueba, limpiar, sembrar, autorizacion } = require('../apoyo/base');

describe('pagos de una reserva', () => {
  let datos;
  let admin;
  let cliente;
  let otroCliente;
  let reserva;

  const TOTAL = 12000;

  before(verificarBaseDePrueba);

  beforeEach(async () => {
    await limpiar();
    datos = await sembrar();
    admin = autorizacion(datos.admin);
    cliente = autorizacion(datos.cliente);
    otroCliente = autorizacion(datos.otroCliente);

    const respuesta = await request(app)
      .post('/api/reservas')
      .set(...cliente)
      .send({ horarioId: datos.turnoLibre.id });

    reserva = respuesta.body;
  });

  after(async () => {
    await limpiar();
    await prisma.$disconnect();
  });

  const cobrar = (autorizacionDeQuien, cuerpo) =>
    request(app)
      .post('/api/pagos')
      .set(...autorizacionDeQuien)
      .send({ reservaId: reserva.id, metodo: 'EFECTIVO', ...cuerpo });

  const anular = (autorizacionDeQuien, id) =>
    request(app)
      .put(`/api/pagos/${id}/anular`)
      .set(...autorizacionDeQuien)
      .send({});

  const estadoDeLaReserva = async () =>
    (await prisma.reserva.findUnique({ where: { id: reserva.id } })).estado;

  describe('la reserva nace pendiente de pago', () => {
    it('el alta la deja en PENDIENTE', async () => {
      assert.equal(reserva.estado, 'PENDIENTE');
    });

    it('y sin ningún pago', async () => {
      assert.deepEqual(reserva.pagos, []);
    });
  });

  describe('POST /api/pagos', () => {
    it('registra el pago con la fecha y el estado que pone el servidor', async () => {
      const respuesta = await cobrar(admin, { monto: 5000 });

      assert.equal(respuesta.status, 201);
      assert.equal(respuesta.body.monto, 5000);
      assert.equal(respuesta.body.estado, 'REGISTRADO');
      assert.match(respuesta.body.fecha, /^\d{4}-\d{2}-\d{2}$/);
    });

    it('lo deja realmente guardado', async () => {
      const { body } = await cobrar(admin, { monto: 5000 });

      const guardado = await prisma.pago.findUnique({ where: { id: body.id } });

      assert.notEqual(guardado, null);
      assert.equal(Number(guardado.monto), 5000);
    });

    it('un pago parcial deja la reserva en PENDIENTE', async () => {
      await cobrar(admin, { monto: 5000 });

      assert.equal(await estadoDeLaReserva(), 'PENDIENTE');
    });

    it('pagar el total la deja CONFIRMADA', async () => {
      const respuesta = await cobrar(admin, { monto: TOTAL });

      assert.equal(await estadoDeLaReserva(), 'CONFIRMADA');
      assert.equal(respuesta.body.reserva.estado, 'CONFIRMADA');
    });

    it('dos pagos parciales que suman el total también la confirman', async () => {
      await cobrar(admin, { monto: 5000 });
      assert.equal(await estadoDeLaReserva(), 'PENDIENTE');

      await cobrar(admin, { monto: 7000 });

      assert.equal(await estadoDeLaReserva(), 'CONFIRMADA');
    });

    it('rechaza un monto que supera el saldo', async () => {
      await cobrar(admin, { monto: 10000 });

      const respuesta = await cobrar(admin, { monto: 5000 });

      assert.equal(respuesta.status, 409);
      assert.match(respuesta.body.mensaje, /supera el saldo/);
    });

    it('rechaza un pago sobre una reserva ya paga', async () => {
      await cobrar(admin, { monto: TOTAL });

      const respuesta = await cobrar(admin, { monto: 1000 });

      assert.equal(respuesta.status, 409);
      assert.match(respuesta.body.mensaje, /ya está paga/);
    });

    it('rechaza un pago sobre una reserva cancelada', async () => {
      await request(app)
        .put(`/api/reservas/${reserva.id}/cancelar`)
        .set(...cliente)
        .send({});

      const respuesta = await cobrar(admin, { monto: 5000 });

      assert.equal(respuesta.status, 409);
      assert.match(respuesta.body.mensaje, /cancelada/);
    });

    it('rechaza un monto de cero', async () => {
      const respuesta = await cobrar(admin, { monto: 0 });

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /mayor a cero/);
    });

    it('rechaza un método que no está en el enum', async () => {
      const respuesta = await cobrar(admin, { monto: 5000, metodo: 'TRUEQUE' });

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /EFECTIVO/);
    });

    it('rechaza con 400 una reserva que no existe', async () => {
      const respuesta = await request(app)
        .post('/api/pagos')
        .set(...admin)
        .send({ reservaId: 999999, monto: 5000, metodo: 'EFECTIVO' });

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /no existe/);
    });

    it('un cliente no puede registrar un pago, ni el de su propia reserva', async () => {
      const respuesta = await cobrar(cliente, { monto: 5000 });

      assert.equal(respuesta.status, 403);
      assert.equal(await prisma.pago.count(), 0);
    });
  });

  describe('GET /api/pagos', () => {
    let ajena;

    beforeEach(async () => {
      await cobrar(admin, { monto: 5000 });

      const otra = await request(app)
        .post('/api/reservas')
        .set(...otroCliente)
        .send({ horarioId: datos.otroTurnoLibre.id });

      ajena = otra.body;

      await request(app)
        .post('/api/pagos')
        .set(...admin)
        .send({ reservaId: ajena.id, monto: 3000, metodo: 'TARJETA' });
    });

    it('el administrador ve todos los pagos', async () => {
      const respuesta = await request(app).get('/api/pagos').set(...admin);

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.length, 2);
    });

    it('el cliente solo ve los de sus reservas', async () => {
      const respuesta = await request(app).get('/api/pagos').set(...cliente);

      assert.equal(respuesta.body.length, 1);
      assert.equal(respuesta.body[0].reservaId, reserva.id);
    });

    it('el cliente no llega al pago de otro ni filtrando por su reserva', async () => {
      const respuesta = await request(app)
        .get(`/api/pagos?reservaId=${ajena.id}`)
        .set(...cliente);

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.length, 0);
    });

    it('filtra por reserva', async () => {
      const respuesta = await request(app)
        .get(`/api/pagos?reservaId=${ajena.id}`)
        .set(...admin);

      assert.equal(respuesta.body.length, 1);
      assert.equal(respuesta.body[0].metodo, 'TARJETA');
    });

    it('rechaza un estado que no está en el enum', async () => {
      const respuesta = await request(app).get('/api/pagos?estado=BASURA').set(...admin);

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /REGISTRADO/);
    });
  });

  describe('GET /api/pagos/:id', () => {
    let pago;

    beforeEach(async () => {
      pago = (await cobrar(admin, { monto: 5000 })).body;
    });

    it('el dueño de la reserva ve su pago', async () => {
      const respuesta = await request(app).get(`/api/pagos/${pago.id}`).set(...cliente);

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.id, pago.id);
    });

    it('otro cliente no lo ve', async () => {
      const respuesta = await request(app).get(`/api/pagos/${pago.id}`).set(...otroCliente);

      assert.equal(respuesta.status, 403);
    });

    it('responde 404 si el id no existe', async () => {
      assert.equal((await request(app).get('/api/pagos/999999').set(...admin)).status, 404);
    });

    it('responde 400 si el id no es un número', async () => {
      assert.equal((await request(app).get('/api/pagos/pepe').set(...admin)).status, 400);
    });
  });

  describe('PUT /api/pagos/:id', () => {
    let pago;

    beforeEach(async () => {
      pago = (await cobrar(admin, { monto: TOTAL })).body;
    });

    const corregir = (autorizacionDeQuien, cuerpo) =>
      request(app)
        .put(`/api/pagos/${pago.id}`)
        .set(...autorizacionDeQuien)
        .send(cuerpo);

    it('corrige el método', async () => {
      const respuesta = await corregir(admin, { metodo: 'TRANSFERENCIA' });

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.metodo, 'TRANSFERENCIA');
    });

    it('ignora el monto que venga en el cuerpo', async () => {
      await corregir(admin, { metodo: 'TARJETA', monto: 1 });

      const guardado = await prisma.pago.findUnique({ where: { id: pago.id } });

      assert.equal(Number(guardado.monto), TOTAL);
      assert.equal(await estadoDeLaReserva(), 'CONFIRMADA');
    });

    it('rechaza un método que no está en el enum', async () => {
      const respuesta = await corregir(admin, { metodo: 'TRUEQUE' });

      assert.equal(respuesta.status, 400);
    });

    it('no modifica un pago anulado', async () => {
      await anular(admin, pago.id);

      const respuesta = await corregir(admin, { metodo: 'TARJETA' });

      assert.equal(respuesta.status, 409);
      assert.match(respuesta.body.mensaje, /anulado/);
    });

    it('un cliente no puede corregir un pago', async () => {
      assert.equal((await corregir(cliente, { metodo: 'TARJETA' })).status, 403);
    });
  });

  describe('PUT /api/pagos/:id/anular', () => {
    let pago;

    beforeEach(async () => {
      pago = (await cobrar(admin, { monto: TOTAL })).body;
    });

    it('lo deja en ANULADO sin borrar la fila', async () => {
      const respuesta = await anular(admin, pago.id);

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.estado, 'ANULADO');
      assert.notEqual(await prisma.pago.findUnique({ where: { id: pago.id } }), null);
    });

    it('devuelve la reserva a PENDIENTE', async () => {
      assert.equal(await estadoDeLaReserva(), 'CONFIRMADA');

      const respuesta = await anular(admin, pago.id);

      assert.equal(await estadoDeLaReserva(), 'PENDIENTE');
      assert.equal(respuesta.body.reserva.estado, 'PENDIENTE');
    });

    it('el saldo vuelve a estar disponible para cobrar de nuevo', async () => {
      await anular(admin, pago.id);

      const respuesta = await cobrar(admin, { monto: TOTAL });

      assert.equal(respuesta.status, 201);
      assert.equal(await estadoDeLaReserva(), 'CONFIRMADA');
    });

    it('no se puede anular dos veces', async () => {
      await anular(admin, pago.id);

      const respuesta = await anular(admin, pago.id);

      assert.equal(respuesta.status, 409);
      assert.match(respuesta.body.mensaje, /ya está anulado/);
    });

    it('responde 404 si el id no existe', async () => {
      assert.equal((await anular(admin, 999999)).status, 404);
    });

    it('un cliente no puede anular un pago', async () => {
      const respuesta = await anular(cliente, pago.id);

      assert.equal(respuesta.status, 403);
      assert.equal(await estadoDeLaReserva(), 'CONFIRMADA');
    });
  });

  describe('el pago en el resto de la API', () => {
    it('la reserva devuelve sus pagos incluidos', async () => {
      await cobrar(admin, { monto: 5000 });

      const respuesta = await request(app).get(`/api/reservas/${reserva.id}`).set(...cliente);

      assert.equal(respuesta.body.pagos.length, 1);
      assert.equal(respuesta.body.pagos[0].monto, 5000);
    });

    it('reprogramar a un turno más caro devuelve la reserva a PENDIENTE', async () => {
      await cobrar(admin, { monto: TOTAL });
      assert.equal(await estadoDeLaReserva(), 'CONFIRMADA');

      const respuesta = await request(app)
        .put(`/api/reservas/${reserva.id}`)
        .set(...cliente)
        .send({ horarioId: datos.otroTurnoLibre.id });

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.estado, 'PENDIENTE');
      assert.equal(respuesta.body.precioTotal, 18000);
    });

    it('cancelar una reserva paga la deja cancelada y conserva el pago', async () => {
      const pago = (await cobrar(admin, { monto: TOTAL })).body;

      await request(app)
        .put(`/api/reservas/${reserva.id}/cancelar`)
        .set(...cliente)
        .send({});

      assert.equal(await estadoDeLaReserva(), 'CANCELADA');
      assert.notEqual(await prisma.pago.findUnique({ where: { id: pago.id } }), null);
    });

    it('no se puede eliminar la reserva de un pago: no hay DELETE', async () => {
      await cobrar(admin, { monto: 5000 });

      const respuesta = await request(app).delete(`/api/reservas/${reserva.id}`).set(...admin);

      assert.equal(respuesta.status, 404);
    });
  });
});

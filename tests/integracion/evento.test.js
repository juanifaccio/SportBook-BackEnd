const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../../src/app');
const { prisma, verificarBaseDePrueba, limpiar, sembrar, autorizacion } = require('../apoyo/base');

/**
 * El evento que se le declara a una reserva: qué se viene a hacer y cuánta gente
 * va. Lo que solo se ve al juntar las piezas es de quién es cada evento —el
 * permiso depende del dueño de la reserva del otro lado— y qué pasa cuando la
 * reserva ya no admite cambios.
 */
describe('eventos de una reserva', () => {
  let datos;
  let admin;
  let cliente;
  let otroCliente;
  let reservaPropia;
  let reservaAjena;

  before(verificarBaseDePrueba);

  beforeEach(async () => {
    await limpiar();
    datos = await sembrar();
    admin = autorizacion(datos.admin);
    cliente = autorizacion(datos.cliente);
    otroCliente = autorizacion(datos.otroCliente);

    // Las reservas se crean por la API, que es como nacen todas. No se siembran
    // en `base.js` para no arrastrarlas a las otras suites.
    reservaPropia = await reservar(cliente, datos.turnoLibre.id);
    reservaAjena = await reservar(otroCliente, datos.otroTurnoLibre.id);
  });

  after(async () => {
    await limpiar();
    await prisma.$disconnect();
  });

  const reservar = async (autorizacionDeQuien, horarioId) => {
    const respuesta = await request(app)
      .post('/api/reservas')
      .set(...autorizacionDeQuien)
      .send({ horarioId: horarioId });

    return respuesta.body;
  };

  const cancelar = (autorizacionDeQuien, reservaId) =>
    request(app)
      .put(`/api/reservas/${reservaId}/cancelar`)
      .set(...autorizacionDeQuien)
      .send({});

  const evento = (cambios = {}) => ({
    descripcion: 'Cumpleaños de 15',
    cantidadPersonas: 40,
    tipoEventoId: datos.tipoEvento.id,
    reservaId: reservaPropia.id,
    ...cambios
  });

  const crear = (autorizacionDeQuien, cuerpo) =>
    request(app)
      .post('/api/eventos')
      .set(...autorizacionDeQuien)
      .send(cuerpo);

  describe('POST /api/eventos', () => {
    it('crea el evento de la reserva propia', async () => {
      const respuesta = await crear(cliente, evento());

      assert.equal(respuesta.status, 201);
      assert.equal(respuesta.body.descripcion, 'Cumpleaños de 15');
      assert.equal(respuesta.body.cantidadPersonas, 40);
      assert.equal(respuesta.body.reservaId, reservaPropia.id);
    });

    it('lo deja realmente guardado', async () => {
      const { body } = await crear(cliente, evento());

      const guardado = await prisma.evento.findUnique({ where: { id: body.id } });

      assert.notEqual(guardado, null);
      assert.equal(guardado.reservaId, reservaPropia.id);
    });

    // La reserva viaja adentro del evento y pasa por las mismas conversiones que
    // cuando se la pide por su propio endpoint.
    it('devuelve la reserva y el tipo incluidos, ya adaptados', async () => {
      const { body } = await crear(cliente, evento());

      assert.equal(body.tipoEvento.nombre, datos.tipoEvento.nombre);
      assert.match(body.reserva.fecha, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(typeof body.reserva.precioTotal, 'number');
      assert.equal(body.reserva.cancha.nombre, datos.cancha.nombre);
      assert.equal(body.reserva.usuario.contrasena, undefined);
    });

    it('rechaza el evento sin descripción', async () => {
      const respuesta = await crear(cliente, evento({ descripcion: '' }));

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /descripción/);
    });

    it('rechaza una cantidad de personas de cero', async () => {
      const respuesta = await crear(cliente, evento({ cantidadPersonas: 0 }));

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /mayor a cero/);
    });

    // El tipo llega en el cuerpo, así que un id inexistente es un dato inválido
    // del cliente y no un recurso faltante en la URL.
    it('rechaza con 400 un tipo de evento que no existe', async () => {
      const respuesta = await crear(cliente, evento({ tipoEventoId: 999999 }));

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /no existe/);
    });

    it('rechaza con 400 una reserva que no existe', async () => {
      const respuesta = await crear(admin, evento({ reservaId: 999999 }));

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /no existe/);
    });

    it('rechaza el evento sin reserva', async () => {
      const respuesta = await crear(cliente, evento({ reservaId: undefined }));

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /reserva es obligatoria/);
    });

    // El @unique de `reservaId` es el 1:0..1 del modelo: una reserva tiene a lo
    // sumo un evento.
    it('no admite dos eventos sobre la misma reserva', async () => {
      await crear(cliente, evento());

      const respuesta = await crear(cliente, evento({ descripcion: 'Otro festejo' }));

      assert.equal(respuesta.status, 409);
      assert.match(respuesta.body.mensaje, /ya tiene un evento/);
    });

    it('no le carga un evento a una reserva cancelada', async () => {
      await cancelar(cliente, reservaPropia.id);

      const respuesta = await crear(cliente, evento());

      assert.equal(respuesta.status, 409);
      assert.match(respuesta.body.mensaje, /cancelada/);
    });

    it('no deja que un cliente le cargue un evento a la reserva de otro', async () => {
      const respuesta = await crear(cliente, evento({ reservaId: reservaAjena.id }));

      assert.equal(respuesta.status, 403);
      assert.match(respuesta.body.mensaje, /de otro usuario/);
      assert.equal(await prisma.evento.findUnique({ where: { reservaId: reservaAjena.id } }), null);
    });

    // El administrador es el mostrador del complejo: carga el evento de la
    // reserva de cualquiera.
    it('deja que el administrador cargue el evento de cualquier reserva', async () => {
      const respuesta = await crear(admin, evento({ reservaId: reservaAjena.id }));

      assert.equal(respuesta.status, 201);
    });
  });

  describe('GET /api/eventos', () => {
    beforeEach(async () => {
      await crear(cliente, evento());
      await crear(otroCliente, evento({ reservaId: reservaAjena.id, descripcion: 'Torneo' }));
    });

    it('el administrador ve todos los eventos', async () => {
      const respuesta = await request(app).get('/api/eventos').set(...admin);

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.length, 2);
    });

    // El listado del cliente es siempre el de sus propias reservas: el filtro se
    // pisa aunque mande el de otro.
    it('el cliente solo ve los de sus reservas', async () => {
      const respuesta = await request(app).get('/api/eventos').set(...cliente);

      assert.equal(respuesta.body.length, 1);
      assert.equal(respuesta.body[0].reservaId, reservaPropia.id);
    });

    it('el cliente no llega al evento de otro ni filtrando por su reserva', async () => {
      const respuesta = await request(app)
        .get(`/api/eventos?reservaId=${reservaAjena.id}`)
        .set(...cliente);

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.length, 0);
    });

    it('filtra por reserva', async () => {
      const respuesta = await request(app)
        .get(`/api/eventos?reservaId=${reservaAjena.id}`)
        .set(...admin);

      assert.equal(respuesta.body.length, 1);
      assert.equal(respuesta.body[0].descripcion, 'Torneo');
    });

    it('rechaza un filtro de reserva que no es un número', async () => {
      const respuesta = await request(app).get('/api/eventos?reservaId=pepe').set(...admin);

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /debe ser un número/);
    });
  });

  describe('GET /api/eventos/:id', () => {
    let creado;

    beforeEach(async () => {
      creado = (await crear(cliente, evento())).body;
    });

    it('devuelve el evento con su reserva', async () => {
      const respuesta = await request(app).get(`/api/eventos/${creado.id}`).set(...cliente);

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.id, creado.id);
      assert.equal(respuesta.body.reserva.id, reservaPropia.id);
    });

    it('responde 400 si el id no es un número', async () => {
      const respuesta = await request(app).get('/api/eventos/pepe').set(...admin);

      assert.equal(respuesta.status, 400);
    });

    it('responde 404 si el id no existe', async () => {
      const respuesta = await request(app).get('/api/eventos/999999').set(...admin);

      assert.equal(respuesta.status, 404);
    });

    it('no deja que un cliente vea el evento de otro', async () => {
      const respuesta = await request(app).get(`/api/eventos/${creado.id}`).set(...otroCliente);

      assert.equal(respuesta.status, 403);
    });
  });

  describe('PUT /api/eventos/:id', () => {
    let creado;

    beforeEach(async () => {
      creado = (await crear(cliente, evento())).body;
    });

    const actualizar = (autorizacionDeQuien, id, cuerpo) =>
      request(app)
        .put(`/api/eventos/${id}`)
        .set(...autorizacionDeQuien)
        .send(cuerpo);

    it('actualiza la descripción y la cantidad de personas', async () => {
      const respuesta = await actualizar(cliente, creado.id, {
        descripcion: 'Cumpleaños de 18',
        cantidadPersonas: 25,
        tipoEventoId: datos.tipoEvento.id
      });

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.descripcion, 'Cumpleaños de 18');
      assert.equal(respuesta.body.cantidadPersonas, 25);
    });

    // Mover un evento de una reserva a otra no es una operación del negocio: el
    // `reservaId` del cuerpo se ignora.
    it('no mueve el evento a otra reserva aunque le manden el id', async () => {
      const respuesta = await actualizar(admin, creado.id, {
        descripcion: 'Cumpleaños de 18',
        cantidadPersonas: 25,
        tipoEventoId: datos.tipoEvento.id,
        reservaId: reservaAjena.id
      });

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.body.reservaId, reservaPropia.id);
    });

    it('rechaza con 400 un tipo de evento que no existe', async () => {
      const respuesta = await actualizar(cliente, creado.id, {
        descripcion: 'Cumpleaños de 18',
        cantidadPersonas: 25,
        tipoEventoId: 999999
      });

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.body.mensaje, /no existe/);
    });

    it('responde 404 si el id no existe', async () => {
      const respuesta = await actualizar(admin, 999999, evento());

      assert.equal(respuesta.status, 404);
    });

    it('no deja que un cliente edite el evento de otro', async () => {
      const respuesta = await actualizar(otroCliente, creado.id, {
        descripcion: 'Mío ahora',
        cantidadPersonas: 5,
        tipoEventoId: datos.tipoEvento.id
      });

      assert.equal(respuesta.status, 403);
    });

    it('no edita el evento de una reserva cancelada', async () => {
      await cancelar(cliente, reservaPropia.id);

      const respuesta = await actualizar(cliente, creado.id, {
        descripcion: 'Cumpleaños de 18',
        cantidadPersonas: 25,
        tipoEventoId: datos.tipoEvento.id
      });

      assert.equal(respuesta.status, 409);
      assert.match(respuesta.body.mensaje, /cancelada/);
    });
  });

  describe('DELETE /api/eventos/:id', () => {
    let creado;

    beforeEach(async () => {
      creado = (await crear(cliente, evento())).body;
    });

    it('elimina el evento', async () => {
      const respuesta = await request(app).delete(`/api/eventos/${creado.id}`).set(...cliente);

      assert.equal(respuesta.status, 200);
      assert.equal(await prisma.evento.findUnique({ where: { id: creado.id } }), null);
    });

    // A diferencia de la edición, borrar el evento de una reserva cancelada sí se
    // permite: es limpiar un dato que ya no aplica.
    it('elimina el evento de una reserva cancelada', async () => {
      await cancelar(cliente, reservaPropia.id);

      const respuesta = await request(app).delete(`/api/eventos/${creado.id}`).set(...cliente);

      assert.equal(respuesta.status, 200);
    });

    it('responde 404 si el id no existe', async () => {
      const respuesta = await request(app).delete('/api/eventos/999999').set(...admin);

      assert.equal(respuesta.status, 404);
    });

    it('no deja que un cliente borre el evento de otro', async () => {
      const respuesta = await request(app).delete(`/api/eventos/${creado.id}`).set(...otroCliente);

      assert.equal(respuesta.status, 403);
      assert.notEqual(await prisma.evento.findUnique({ where: { id: creado.id } }), null);
    });

    // Después de borrarlo, la reserva vuelve a admitir un evento nuevo.
    it('deja la reserva libre para cargarle otro evento', async () => {
      await request(app).delete(`/api/eventos/${creado.id}`).set(...cliente);

      const respuesta = await crear(cliente, evento({ descripcion: 'Torneo' }));

      assert.equal(respuesta.status, 201);
    });
  });

  describe('el evento en el resto de la API', () => {
    it('la reserva lo devuelve incluido en su detalle', async () => {
      await crear(cliente, evento());

      const respuesta = await request(app).get(`/api/reservas/${reservaPropia.id}`).set(...cliente);

      assert.equal(respuesta.body.evento.descripcion, 'Cumpleaños de 15');
      assert.equal(respuesta.body.evento.tipoEvento.nombre, datos.tipoEvento.nombre);
    });

    it('una reserva sin evento lo devuelve en null', async () => {
      const respuesta = await request(app).get(`/api/reservas/${reservaPropia.id}`).set(...cliente);

      assert.equal(respuesta.body.evento, null);
    });

    // La clave foránea de la base es la que frena el borrado; el controller
    // traduce ese error de Prisma a un 409 con un mensaje que se entienda.
    it('no elimina un tipo de evento que tiene eventos asociados', async () => {
      await crear(cliente, evento());

      const respuesta = await request(app)
        .delete(`/api/tipos-evento/${datos.tipoEvento.id}`)
        .set(...admin);

      assert.equal(respuesta.status, 409);
      assert.match(respuesta.body.mensaje, /eventos asociados/);
      assert.notEqual(
        await prisma.tipoEvento.findUnique({ where: { id: datos.tipoEvento.id } }),
        null
      );
    });
  });
});

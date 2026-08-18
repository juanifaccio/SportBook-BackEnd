const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { validarDatos, armarFiltro, aRespuesta } = require('../../src/controllers/evento.controller');

const cuerpo = (cambios = {}) => ({
  descripcion: 'Cumpleaños de 15',
  cantidadPersonas: 40,
  tipoEventoId: 2,
  ...cambios
});

describe('evento — validación', () => {
  describe('validarDatos', () => {
    it('acepta un evento bien formado', () => {
      assert.deepEqual(validarDatos(cuerpo()), {
        datos: { descripcion: 'Cumpleaños de 15', cantidadPersonas: 40, tipoEventoId: 2 }
      });
    });

    it('recorta los espacios de la descripción', () => {
      assert.equal(validarDatos(cuerpo({ descripcion: '  Torneo  ' })).datos.descripcion, 'Torneo');
    });

    it('rechaza el evento sin descripción', () => {
      assert.match(validarDatos(cuerpo({ descripcion: '' })).mensaje, /descripción/);
    });

    it('rechaza una descripción que es solo espacios', () => {
      assert.match(validarDatos(cuerpo({ descripcion: '   ' })).mensaje, /descripción/);
    });

    it('acepta la cantidad y el tipo como texto, que es como llegan del formulario', () => {
      const { datos } = validarDatos(cuerpo({ cantidadPersonas: '40', tipoEventoId: '3' }));

      assert.equal(datos.cantidadPersonas, 40);
      assert.equal(datos.tipoEventoId, 3);
    });

    it('rechaza una cantidad de personas que no es un número', () => {
      assert.match(validarDatos(cuerpo({ cantidadPersonas: 'muchos' })).mensaje, /cantidad de personas/);
    });

    // Un evento de cero personas no es un evento, y uno de menos no existe.
    it('rechaza una cantidad de cero o negativa', () => {
      assert.match(validarDatos(cuerpo({ cantidadPersonas: 0 })).mensaje, /mayor a cero/);
      assert.match(validarDatos(cuerpo({ cantidadPersonas: -5 })).mensaje, /mayor a cero/);
    });

    // Medio invitado no existe: si esto pasara, la base truncaría el decimal en
    // silencio y el complejo prepararía para una cantidad distinta a la pedida.
    it('rechaza una cantidad con decimales', () => {
      assert.match(validarDatos(cuerpo({ cantidadPersonas: 12.5 })).mensaje, /entero/);
    });

    it('rechaza el evento sin tipo', () => {
      assert.match(validarDatos(cuerpo({ tipoEventoId: undefined })).mensaje, /tipo de evento/);
    });

    // `reservaId` no lo valida `validarDatos` sino el alta: la edición no mueve
    // el evento de una reserva a otra, así que mandarlo no cambia nada.
    it('ignora la reserva que venga en el cuerpo', () => {
      const { datos } = validarDatos(cuerpo({ reservaId: 7 }));

      assert.equal(datos.reservaId, undefined);
    });
  });

  describe('armarFiltro', () => {
    it('sin query no filtra nada', () => {
      assert.deepEqual(armarFiltro({}), { filtro: {} });
    });

    it('filtra por reserva', () => {
      assert.deepEqual(armarFiltro({ reservaId: '4' }), { filtro: { reservaId: 4 } });
    });

    it('rechaza una reserva que no es un número', () => {
      assert.match(armarFiltro({ reservaId: 'pepe' }).mensaje, /debe ser un número/);
    });

    it('ignora los query params que no conoce', () => {
      assert.deepEqual(armarFiltro({ cualquiera: 'x' }), { filtro: {} });
    });
  });

  describe('aRespuesta', () => {
    const evento = (reserva) => ({
      id: 1,
      descripcion: 'Cumpleaños de 15',
      cantidadPersonas: 40,
      tipoEventoId: 2,
      reservaId: 5,
      reserva: reserva
    });

    it('deja los campos propios como estaban', () => {
      const respuesta = aRespuesta(evento(undefined));

      assert.equal(respuesta.descripcion, 'Cumpleaños de 15');
      assert.equal(respuesta.cantidadPersonas, 40);
    });

    it('no se rompe si el evento viene sin su reserva', () => {
      assert.equal(aRespuesta(evento(undefined)).reserva, undefined);
    });

    // La reserva anidada pasa por las mismas conversiones que cuando se la pide
    // por su propio endpoint: el DATE recortado y el Decimal como número.
    it('adapta la reserva incluida', () => {
      const respuesta = aRespuesta(
        evento({
          id: 5,
          fecha: new Date('2026-08-20T00:00:00.000Z'),
          precioTotal: '12000.00',
          estado: 'CONFIRMADA'
        })
      );

      assert.equal(respuesta.reserva.fecha, '2026-08-20');
      assert.equal(respuesta.reserva.precioTotal, 12000);
    });
  });
});

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  subtotalDe,
  sumarImportes,
  validarEquipamientos,
  sumarAlquilado,
  disponiblesDe,
  armarEquipamientos,
  aRespuesta
} = require('../../src/controllers/reserva.controller');

/** Artículo tal como lo devuelve Prisma: el precio llega como texto. */
const pelota = { id: 1, nombre: 'Pelota de fútbol', precio: '1500.00', stock: 10 };
const pechera = { id: 2, nombre: 'Pechera', precio: '800.50', stock: 4 };

describe('reserva con equipamiento: reglas del negocio', () => {
  describe('subtotalDe', () => {
    it('multiplica el precio por la cantidad', () => {
      assert.equal(subtotalDe(1500, 3), 4500);
    });

    // Prisma devuelve los Decimal como string.
    it('acepta el precio como texto', () => {
      assert.equal(subtotalDe('800.50', 3), 2401.5);
    });

    it('redondea a centavos', () => {
      assert.equal(subtotalDe(0.1, 3), 0.3);
    });
  });

  describe('sumarImportes', () => {
    it('suma sin arrastrar el error del punto flotante', () => {
      assert.equal(sumarImportes(0.1, 0.2), 0.3);
    });
  });

  describe('validarEquipamientos', () => {
    it('es opcional: sin el campo no se alquila nada', () => {
      assert.deepEqual(validarEquipamientos(undefined), { items: [] });
      assert.deepEqual(validarEquipamientos(null), { items: [] });
    });

    it('convierte los ids y las cantidades a número', () => {
      assert.deepEqual(validarEquipamientos([{ equipamientoId: '1', cantidad: '2' }]), {
        items: [{ equipamientoId: 1, cantidad: 2 }]
      });
    });

    it('rechaza algo que no es una lista', () => {
      assert.ok(validarEquipamientos({ equipamientoId: 1, cantidad: 2 }).mensaje);
    });

    it('pide el equipamiento de cada renglón', () => {
      assert.ok(validarEquipamientos([{ cantidad: 2 }]).mensaje);
      assert.ok(validarEquipamientos([null]).mensaje);
    });

    it('rechaza cantidades de cero, negativas o con decimales', () => {
      for (const cantidad of [0, -1, 1.5, 'dos', undefined]) {
        assert.ok(validarEquipamientos([{ equipamientoId: 1, cantidad }]).mensaje, `cantidad ${cantidad}`);
      }
    });

    it('rechaza el mismo artículo dos veces', () => {
      const resultado = validarEquipamientos([
        { equipamientoId: 1, cantidad: 1 },
        { equipamientoId: 1, cantidad: 2 }
      ]);

      assert.ok(resultado.mensaje);
    });
  });

  describe('sumarAlquilado', () => {
    it('suma las cantidades de cada artículo entre reservas', () => {
      const alquilado = sumarAlquilado([
        { equipamientoId: 1, cantidad: 2 },
        { equipamientoId: 2, cantidad: 1 },
        { equipamientoId: 1, cantidad: 3 }
      ]);

      assert.equal(alquilado.get(1), 5);
      assert.equal(alquilado.get(2), 1);
    });
  });

  describe('disponiblesDe', () => {
    it('es el stock menos lo alquilado en el turno', () => {
      assert.equal(disponiblesDe(pelota, new Map([[1, 3]])), 7);
    });

    it('sin nada alquilado es el stock entero', () => {
      assert.equal(disponiblesDe(pelota, new Map()), 10);
    });

    // Si se bajó el stock después de alquilar, lo alquilado puede superarlo:
    // no quedan unidades, pero tampoco una cantidad negativa.
    it('nunca da negativo', () => {
      assert.equal(disponiblesDe(pechera, new Map([[2, 6]])), 0);
    });
  });

  describe('armarEquipamientos', () => {
    it('arma las filas con su subtotal y el total', () => {
      const resultado = armarEquipamientos(
        [
          { equipamientoId: 1, cantidad: 2 },
          { equipamientoId: 2, cantidad: 1 }
        ],
        [pelota, pechera],
        new Map()
      );

      assert.deepEqual(resultado, {
        filas: [
          { equipamientoId: 1, cantidad: 2, subtotal: 3000 },
          { equipamientoId: 2, cantidad: 1, subtotal: 800.5 }
        ],
        total: 3800.5
      });
    });

    it('acepta llevarse exactamente lo que queda', () => {
      const resultado = armarEquipamientos([{ equipamientoId: 1, cantidad: 7 }], [pelota], new Map([[1, 3]]));

      assert.equal(resultado.filas.length, 1);
    });

    it('responde 409 si no alcanza lo que queda en el turno', () => {
      const resultado = armarEquipamientos([{ equipamientoId: 1, cantidad: 8 }], [pelota], new Map([[1, 3]]));

      assert.equal(resultado.codigo, 409);
      assert.match(resultado.mensaje, /Pelota de fútbol/);
    });

    it('responde 400 si el artículo no existe', () => {
      const resultado = armarEquipamientos([{ equipamientoId: 99, cantidad: 1 }], [pelota], new Map());

      assert.equal(resultado.codigo, 400);
    });
  });

  describe('aRespuesta', () => {
    it('devuelve como número el subtotal y el precio del artículo', () => {
      const reserva = aRespuesta({
        fecha: new Date('2026-10-07T00:00:00.000Z'),
        precioTotal: '15000.00',
        equipamientos: [{ id: 1, cantidad: 2, subtotal: '3000.00', equipamiento: pelota }]
      });

      assert.equal(reserva.equipamientos[0].subtotal, 3000);
      assert.equal(reserva.equipamientos[0].equipamiento.precio, 1500);
    });
  });
});

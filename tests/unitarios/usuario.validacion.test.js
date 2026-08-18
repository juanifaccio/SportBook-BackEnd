const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  validarDatos,
  validarPerfil,
  validarCambioDeContrasena,
  aRespuesta
} = require('../../src/controllers/usuario.controller');

const ALTA = false;
const EDICION = true;

const cuerpo = (cambios = {}) => ({
  nombre: 'Lucía Gómez',
  email: 'lucia.gomez@ejemplo.com',
  contrasena: 'unaClave123',
  telefono: '341 555-9876',
  rolId: 2,
  ...cambios
});

describe('usuario — validación', () => {
  describe('validarDatos', () => {
    it('acepta un usuario bien formado', () => {
      assert.deepEqual(validarDatos(cuerpo(), ALTA), {
        datos: {
          nombre: 'Lucía Gómez',
          email: 'lucia.gomez@ejemplo.com',
          telefono: '341 555-9876',
          rolId: 2,
          activo: true,
          contrasena: 'unaClave123'
        }
      });
    });

    // El email se guarda en minúsculas para que el índice único no deje entrar
    // al mismo usuario dos veces escrito con mayúsculas distintas.
    it('normaliza el email a minúsculas y sin espacios', () => {
      assert.equal(validarDatos(cuerpo({ email: '  Lucia.Gomez@Ejemplo.COM ' }), ALTA).datos.email, 'lucia.gomez@ejemplo.com');
    });

    it('da de alta al usuario activo cuando no se dice lo contrario', () => {
      assert.equal(validarDatos(cuerpo(), ALTA).datos.activo, true);
    });

    it('respeta el activo que llega en el cuerpo', () => {
      assert.equal(validarDatos(cuerpo({ activo: false }), EDICION).datos.activo, false);
    });

    it('rechaza un activo que no es booleano', () => {
      assert.match(validarDatos(cuerpo({ activo: 'si' }), ALTA).mensaje, /verdadero o falso/);
    });

    it('rechaza el usuario sin nombre', () => {
      assert.match(validarDatos(cuerpo({ nombre: '  ' }), ALTA).mensaje, /nombre/);
    });

    it('rechaza un email sin arroba o sin dominio', () => {
      assert.match(validarDatos(cuerpo({ email: 'lucia.gomez' }), ALTA).mensaje, /email/);
      assert.match(validarDatos(cuerpo({ email: 'lucia@ejemplo' }), ALTA).mensaje, /email/);
      assert.match(validarDatos(cuerpo({ email: 'lucia @ejemplo.com' }), ALTA).mensaje, /email/);
    });

    // La contraseña es el único campo que cambia según el caso: al editar se
    // puede omitir para dejar la que ya estaba, porque el formulario no la tiene
    // (la API nunca la devuelve).
    it('exige la contraseña al dar de alta', () => {
      assert.match(validarDatos(cuerpo({ contrasena: undefined }), ALTA).mensaje, /contraseña/);
    });

    it('deja omitir la contraseña al editar', () => {
      const { mensaje, datos } = validarDatos(cuerpo({ contrasena: undefined }), EDICION);

      assert.equal(mensaje, undefined);
      assert.equal('contrasena' in datos, false);
    });

    it('rechaza una contraseña corta, también al editar', () => {
      assert.match(validarDatos(cuerpo({ contrasena: 'corta' }), ALTA).mensaje, /8 caracteres/);
      assert.match(validarDatos(cuerpo({ contrasena: 'corta' }), EDICION).mensaje, /8 caracteres/);
    });

    it('acepta una contraseña de exactamente 8 caracteres', () => {
      assert.equal(validarDatos(cuerpo({ contrasena: '12345678' }), ALTA).datos.contrasena, '12345678');
    });

    it('rechaza un teléfono con letras o demasiado corto', () => {
      assert.match(validarDatos(cuerpo({ telefono: 'llamame' }), ALTA).mensaje, /teléfono/);
      assert.match(validarDatos(cuerpo({ telefono: '123' }), ALTA).mensaje, /teléfono/);
    });

    it('acepta un teléfono con prefijo internacional', () => {
      assert.equal(validarDatos(cuerpo({ telefono: '+54 (341) 555-9876' }), ALTA).datos.telefono, '+54 (341) 555-9876');
    });

    it('rechaza el usuario sin rol', () => {
      assert.match(validarDatos(cuerpo({ rolId: undefined }), ALTA).mensaje, /rol/);
    });

    // La contraseña sale de acá en claro: hashearla es cosa del controller, que
    // es el que la guarda.
    it('devuelve la contraseña sin hashear', () => {
      assert.equal(validarDatos(cuerpo(), ALTA).datos.contrasena, 'unaClave123');
    });
  });

  describe('validarPerfil', () => {
    const perfil = (cambios = {}) => ({
      nombre: 'Lucía Gómez',
      email: 'lucia.gomez@ejemplo.com',
      telefono: '341 555-9876',
      ...cambios
    });

    it('acepta un perfil bien formado', () => {
      assert.deepEqual(validarPerfil(perfil()), {
        datos: {
          nombre: 'Lucía Gómez',
          email: 'lucia.gomez@ejemplo.com',
          telefono: '341 555-9876'
        }
      });
    });

    // Es lo que impide que un cliente se ascienda a administrador con un PUT a
    // sus propios datos, o que se reactive una cuenta dada de baja.
    it('descarta el rol y el activo aunque vengan en el cuerpo', () => {
      const { datos } = validarPerfil(perfil({ rolId: 1, activo: true }));

      assert.equal(datos.rolId, undefined);
      assert.equal(datos.activo, undefined);
    });

    // La contraseña se cambia por su propio endpoint, que además pide la actual.
    it('descarta la contraseña aunque venga en el cuerpo', () => {
      assert.equal(validarPerfil(perfil({ contrasena: 'otraClave123' })).datos.contrasena, undefined);
    });

    it('normaliza el email a minúsculas', () => {
      assert.equal(validarPerfil(perfil({ email: 'Lucia.Gomez@Ejemplo.com' })).datos.email, 'lucia.gomez@ejemplo.com');
    });

    // Las mismas reglas que el ABM: el mismo dato mal escrito se queja igual en
    // las dos pantallas.
    it('rechaza el perfil sin nombre', () => {
      assert.match(validarPerfil(perfil({ nombre: '' })).mensaje, /nombre/);
    });

    it('rechaza un email sin arroba o sin dominio', () => {
      assert.match(validarPerfil(perfil({ email: 'lucia' })).mensaje, /email/);
      assert.match(validarPerfil(perfil({ email: 'lucia@ejemplo' })).mensaje, /email/);
    });

    it('rechaza un teléfono con letras o demasiado corto', () => {
      assert.match(validarPerfil(perfil({ telefono: 'no tengo' })).mensaje, /teléfono/);
      assert.match(validarPerfil(perfil({ telefono: '123' })).mensaje, /teléfono/);
    });
  });

  describe('validarCambioDeContrasena', () => {
    const cambio = (cambios = {}) => ({
      contrasenaActual: 'unaClave123',
      contrasenaNueva: 'otraClave456',
      ...cambios
    });

    it('acepta un cambio bien formado', () => {
      assert.deepEqual(validarCambioDeContrasena(cambio()), {
        datos: { actual: 'unaClave123', nueva: 'otraClave456' }
      });
    });

    // Sin la actual, cualquiera con un token prestado le cambia la clave al
    // dueño y lo deja afuera de su propia cuenta.
    it('exige la contraseña actual', () => {
      assert.match(validarCambioDeContrasena(cambio({ contrasenaActual: '' })).mensaje, /actual/);
    });

    it('exige la contraseña nueva', () => {
      assert.match(validarCambioDeContrasena(cambio({ contrasenaNueva: '' })).mensaje, /nueva/);
    });

    it('rechaza una contraseña nueva corta', () => {
      assert.match(validarCambioDeContrasena(cambio({ contrasenaNueva: 'corta' })).mensaje, /8 caracteres/);
    });

    it('acepta una contraseña nueva de exactamente 8 caracteres', () => {
      assert.equal(validarCambioDeContrasena(cambio({ contrasenaNueva: '12345678' })).mensaje, undefined);
    });

    // Cambiarla por la misma no es un cambio: el usuario se iría creyendo que
    // hizo algo.
    it('rechaza una contraseña nueva igual a la actual', () => {
      assert.match(
        validarCambioDeContrasena(cambio({ contrasenaNueva: 'unaClave123' })).mensaje,
        /distinta/
      );
    });

    it('no recorta las contraseñas', () => {
      const { datos } = validarCambioDeContrasena(cambio({ contrasenaNueva: '  con espacios  ' }));

      assert.equal(datos.nueva, '  con espacios  ');
    });
  });

  describe('aRespuesta', () => {
    // Todas las respuestas del controller pasan por acá, así que el hash no
    // puede filtrarse por olvidarse de excluirlo en un endpoint nuevo.
    it('saca la contraseña', () => {
      const usuario = { id: 1, nombre: 'Lucía', email: 'l@ejemplo.com', contrasena: '$2b$10$hash' };

      assert.equal('contrasena' in aRespuesta(usuario), false);
    });

    it('deja el resto de los campos como estaban', () => {
      const usuario = { id: 1, nombre: 'Lucía', email: 'l@ejemplo.com', contrasena: 'x', activo: true };

      assert.deepEqual(aRespuesta(usuario), { id: 1, nombre: 'Lucía', email: 'l@ejemplo.com', activo: true });
    });
  });
});

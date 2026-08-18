// Punto de entrada del servidor: toma la aplicación ya armada por `app.js` y la
// pone a escuchar. Es lo único que hace, para que los tests puedan usar la app
// sin levantar un puerto.
const app = require('./app');
const { puerto } = require('./config/env');

app.listen(puerto, () => {
  console.log(`Servidor ejecutándose en http://localhost:${puerto}`);
});

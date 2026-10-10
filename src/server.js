const app = require('./app');
const { puerto } = require('./config/env');

app.listen(puerto, () => {
  console.log(`Servidor ejecutándose en http://localhost:${puerto}`);
});

const express = require('express');
const cors = require('cors');

const app = express();

const tipoCanchaRoutes = require('./routes/tipoCancha.routes');
const tipoEventoRoutes = require('./routes/tipoEvento.routes');

app.use(cors());
app.use(express.json());

app.use('/api/tipos-cancha', tipoCanchaRoutes);
app.use('/api/tipos-evento', tipoEventoRoutes);

app.get('/', (req, res) => {
  res.json({ mensaje: 'SportBook Backend funcionando' });
});

app.listen(3000, () => {
  console.log('Servidor ejecutándose en http://localhost:3000');
});
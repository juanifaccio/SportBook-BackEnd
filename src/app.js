const express = require('express');
const cors = require('cors');

const { puerto } = require('./config/env');

const app = express();

const tipoCanchaRoutes = require('./routes/tipoCancha.routes');
const tipoEventoRoutes = require('./routes/tipoEvento.routes');
const canchaRoutes = require('./routes/cancha.routes');
const horarioRoutes = require('./routes/horario.routes');
const rolRoutes = require('./routes/rol.routes');
const usuarioRoutes = require('./routes/usuario.routes');
const reservaRoutes = require('./routes/reserva.routes');

app.use(cors());
app.use(express.json());

app.use('/api/tipos-cancha', tipoCanchaRoutes);
app.use('/api/tipos-evento', tipoEventoRoutes);
app.use('/api/canchas', canchaRoutes);
app.use('/api/horarios', horarioRoutes);
app.use('/api/roles', rolRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/reservas', reservaRoutes);

app.get('/', (req, res) => {
  res.json({ mensaje: 'SportBook Backend funcionando' });
});

app.listen(puerto, () => {
  console.log(`Servidor ejecutándose en http://localhost:${puerto}`);
});
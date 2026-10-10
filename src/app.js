const express = require('express');
const cors = require('cors');

const app = express();

const authRoutes = require('./routes/auth.routes');
const tipoCanchaRoutes = require('./routes/tipoCancha.routes');
const tipoEventoRoutes = require('./routes/tipoEvento.routes');
const canchaRoutes = require('./routes/cancha.routes');
const equipamientoRoutes = require('./routes/equipamiento.routes');
const horarioRoutes = require('./routes/horario.routes');
const rolRoutes = require('./routes/rol.routes');
const usuarioRoutes = require('./routes/usuario.routes');
const reservaRoutes = require('./routes/reserva.routes');
const eventoRoutes = require('./routes/evento.routes');
const pagoRoutes = require('./routes/pago.routes');

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);

app.use('/api/tipos-cancha', tipoCanchaRoutes);
app.use('/api/tipos-evento', tipoEventoRoutes);
app.use('/api/canchas', canchaRoutes);
app.use('/api/equipamientos', equipamientoRoutes);
app.use('/api/horarios', horarioRoutes);
app.use('/api/roles', rolRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/reservas', reservaRoutes);
app.use('/api/eventos', eventoRoutes);
app.use('/api/pagos', pagoRoutes);

app.get('/', (req, res) => {
  res.json({ mensaje: 'SportBook Backend funcionando' });
});

module.exports = app;

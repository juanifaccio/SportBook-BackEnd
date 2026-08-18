const express = require('express');
const cors = require('cors');

const app = express();

const authRoutes = require('./routes/auth.routes');
const tipoCanchaRoutes = require('./routes/tipoCancha.routes');
const tipoEventoRoutes = require('./routes/tipoEvento.routes');
const canchaRoutes = require('./routes/cancha.routes');
const horarioRoutes = require('./routes/horario.routes');
const rolRoutes = require('./routes/rol.routes');
const usuarioRoutes = require('./routes/usuario.routes');
const reservaRoutes = require('./routes/reserva.routes');
const eventoRoutes = require('./routes/evento.routes');

app.use(cors());
app.use(express.json());

// Va primero porque es la puerta de entrada: el resto de los recursos exige el
// token que se consigue acá. Quién puede llamar a cada endpoint se declara en el
// archivo de rutas de cada recurso.
app.use('/api/auth', authRoutes);

app.use('/api/tipos-cancha', tipoCanchaRoutes);
app.use('/api/tipos-evento', tipoEventoRoutes);
app.use('/api/canchas', canchaRoutes);
app.use('/api/horarios', horarioRoutes);
app.use('/api/roles', rolRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/reservas', reservaRoutes);
app.use('/api/eventos', eventoRoutes);

app.get('/', (req, res) => {
  res.json({ mensaje: 'SportBook Backend funcionando' });
});

// Este archivo arma la aplicación pero no la pone a escuchar: de eso se ocupa
// `server.js`. Separarlos es lo que permite que los tests de integración le
// manden requests a la app sin ocupar un puerto ni dejar un servidor prendido.
module.exports = app;

const express = require('express');
const app = express();

const tipoCanchaRoutes = require('./routes/tipoCancha.routes');

app.use(express.json());

app.use('/api/tipos-cancha', tipoCanchaRoutes);

app.get('/', (req, res) => {
    res.json({ mensaje: 'SportBook Backend funcionando' });
});

app.listen(3000, () => {
    console.log('Servidor ejecutándose en http://localhost:3000');
});
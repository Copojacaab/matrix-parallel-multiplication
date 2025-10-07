// importa la lib express
const express = require('express');
// crea l'app server
const app = express();
// scelta porta
const PORT = 3000;

// ---- DEFINIZIONE ROTTE ---- 
app.get('/', (req, res) => {
    res.send('Server funzionante');
});

// ---- AVVIO DEL SERVER ----
app.listen(PORT, () => {
    console.log('Server in ascolto sulla porta ' + PORT);
});



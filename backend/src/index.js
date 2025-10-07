// librerie
const express = require('express');
const fs = require('fs'); //file system
const path = require('path'); //gestione percorsi cartelle
// const exec = require('exec'); //comandi terminale
const crypto = require('crypto'); //id unici random

// crea l'app server
const app = express();
app.use(express.json()); //middleware 


const PORT = 3000;

// ---- DEFINIZIONE ROTTE ---- 
app.get('/', (req, res) => { //test server
    res.send('Server funzionante');
});

// nuovo job
app.post('/api/jobs', (req, res) =>{
    //a. creazione id unico
    const jobID = crypto.randomBytes(8).toString('hex');
    console.log(`[${jobID}] Richiesta di calcolo ricevuta`);

    //b. prendo i percorsi dei file
    const workerDir = path.join(__dirname, '..', '..', 'worker');
    const fileA = path.join(workerDir, `matrice_a_${jobID}.txt`);
    const fileB = path.join(workerDir, `matrice_b_${jobID}.txt`);
    const fileC = path.join(workerDir, `risultato_c_${jobID}.txt`);

    //c. conversione matrici da json a stringhe
    const matrixToString = (matrix) => matrix.map(row => row.join(' ')).join('\n');
    const dataA = matrixToString(req.body.matrixA);
    const dataB = matrixToString(req.body.matrixB);

    // d scrivo il primo file
    fs.writeFile(fileA, dataA, (err) =>{
        if(err){
            console.error(`[${jobID}] Errore scrivendo file A: `, err);
            return res.status(500).json({error : 'Errore interno del server' })
        }
        console.log(`[${jobID}] File ${fileA} creato.`);
        res.json({ message: 'File A scritto con successo', jobID: jobID});
    })
});

// ---- AVVIO DEL SERVER ----
app.listen(PORT, () => {
    console.log('Server in ascolto sulla porta ' + PORT);
});



// librerie
const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const crypto = require('crypto');

// moduli db
const { createJob } = require('../database/job_repository');
const { updateJobRunning, updateJobFailure, updateJobSuccess } = require('../database/job_repository');
const { create } = require('domain');

const app = express();
app.use(express.json());

const PORT = 3000;

app.get('/', (req, res) => {
  res.send('Server funzionante!');
});

app.post('/api/jobs', (req, res) => {
  const jobId = crypto.randomBytes(8).toString('hex');
  console.log(`[${jobId}] Richiesta di calcolo ricevuta.`);

  const workerDir = path.join(__dirname, '..', '..', 'worker');

//   definisco i nomi dei file 
  const baseFileA = `matrice_a_${jobId}.txt`;
  const baseFileB = `matrice_b_${jobId}.txt`;
  const baseFileC = `matrice_c_${jobId}.txt`;

  const fileA = path.join(workerDir, baseFileA);
  const fileB = path.join(workerDir, baseFileB);
  const fileC = path.join(workerDir, baseFileC);

  const { matrixA, matrixB } = req.body;
  if (!matrixA || !matrixB || matrixA.length === 0 || matrixB.length === 0) {
    return res.status(400).json({ error: "Matrici di input non fornite o vuote" });
  }
  
  const rowsA = matrixA.length;
  const colsA = matrixA[0].length;
  const rowsB = matrixB.length;
  const colsB = matrixB[0].length;
  
  if (colsA !== rowsB) {
    return res.status(400).json({ error: "Dimensioni matrici non compatibili per la moltiplicazione" });
  }

  const matrixToStringWithDims = (matrix, rows, cols) => `${rows} ${cols}\n` + matrix.map(row => row.join(' ')).join('\n');
  const dataA = matrixToStringWithDims(matrixA, rowsA, colsA);
  const dataB = matrixToStringWithDims(matrixB, rowsB, colsB);

  // creazione job nel db
  createJob(jobId, rowsA, colsA, colsB, dataA, dataB);

  fs.writeFile(fileA, dataA, (err) => {
    if (err) {
      // aggiorno a failed in caso di errore di scrittura
      updateJobFailure(jobId, new Date().toISOString(), 0);
      return res.status(500).json({ error: 'Errore interno del server' }); 
    }
    console.log(`[${jobId}] File ${fileA} creato.`);

    fs.writeFile(fileB, dataB, (err) => {
      if (err) { 
        // aggiorno a failed nel db
        updateJobFailure(jobId, new Date().toISOString(), 0);
        return res.status(500).json({ error: 'Errore interno del server' }); 
      }
      console.log(`[${jobId}] File ${fileB} creato.`);
      
      const command = `/usr/bin/mpirun -n 4 --oversubscribe ./mpimm_exec ${baseFileA} ${baseFileB} ${baseFileC}`;
      console.log(`[${jobId}] Eseguo il comando...`);

      exec(command, { cwd: workerDir }, (error, stdout, stderr) => {
        if (error) {
          console.error(`[${jobId}] Errore durante l'esecuzione del C: `, error);
          return res.status(500).json({ error: 'Errore durante il calcolo' });
        }
        
        console.log(`[${jobId}] Output dal programma C:\n${stdout}`);

        fs.readFile(fileC, 'utf8', (err, data) => {
          if (err) {
            return res.status(500).json({ error: 'Errore nel leggere il risultato' });
          }

          const lines = data.split('\n').filter(line => line);
          const resultMatrix = lines.slice(1) // Salta la riga delle dimensioni
                               .map(row => row.trim().split(/\s+/).map(numStr => parseFloat(numStr)));

          res.json({ 
            message: 'Calcolo completato con successo!', 
            jobId: jobId,
            result: resultMatrix 
          });

          // Pulizia
          fs.unlink(fileA, () => {});
          fs.unlink(fileB, () => {});
          fs.unlink(fileC, () => {});
        });
      });
    });
  });
});

app.listen(PORT, () => {
  console.log('Server in ascolto sulla porta ' + PORT);
});
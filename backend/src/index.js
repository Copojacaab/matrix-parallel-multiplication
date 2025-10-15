// librerie
const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const crypto = require('crypto');

// moduli db
const { createJob, getJobById } = require('../database/job_repository');
const { listJobs } = require('../database/job_repository');
const runner = require('./runner');

const app = express();
app.use(express.json());

const PORT = 3000;

// helper
function isValidMatrix(matrix){
  // se non é una matrice o é vuoto
  if(!Array.isArray(matrix) || matrix.length === 0)
    return false;
  // controllo se ci sono colonne
  const cols = Array.isArray(matrix[0]) ? matrix[0].length : -1;
  if(cols <= 0)
    return false;
  // controllo le righe
  for(const rows of matrix){
    if(!Array.isArray(rows) || rows.length !== cols)
      return false; //righe irregolari
    // check agli elementi
    for(const data of rows){
      if(typeof(data) !== 'number' || !Number.isFinite(data))
          return false;
    }
  }
  // matrice valida
  return true;
}

/**Query:
 * - status
 * - sort: asc | desc
 * - limit, offset
 */
app.get('/api/jobs', async (req, res) => {
  try {
    const { status, sort = 'desc', limit = 50, offset = 0 } = req.query;

    // status consentiti (fix "running")
    const allowed = [undefined, 'queued', 'running', 'completed', 'failed'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Parametro status non valido' });
    }

    // sort valido: accetta asc/desc (la logica prima era invertita)
    const s = String(sort).toLowerCase();
    if (!['asc', 'desc'].includes(s)) {
      return res.status(400).json({ error: 'Parametro sort non valido' });
    }

    // ATTENZIONE: serve await e offset corretto
    const rows = await listJobs({
      status,
      sort: s,
      limit: Number(limit),
      offset: Number(offset),
    });

    // items (plurale) e total coerenti
    res.json({
      total: rows.length,
      items: rows,
    });
  } catch (error) {
    console.error('GET /api/jobs error ', error);
    res.status(500).json({ error: 'errore interno al db' });
  }
});


app.get('/api/jobs/:id', async (req, res) => {
  try {
    const job = await getJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'not found' });
    res.json(job);
  } catch (e) {
    console.error('GET /api/jobs/:id error', e);
    res.status(500).json({ error: 'db error' });
  }
});


app.post('/api/jobs', async (req, res) => {
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
  
  // validazione matrici input
  if(!isValidMatrix(matrixA) || !isValidMatrix(matrixB)){
    return res.status(400).json({ error: 'Matrici non valide: righe irregolari o elementi non numerici'});
  }

  if (colsA !== rowsB) {
    return res.status(400).json({ error: "Dimensioni matrici non compatibili per la moltiplicazione" });
  }

  const matrixToStringWithDims = (matrix, rows, cols) => `${rows} ${cols}\n` + matrix.map(row => row.join(' ')).join('\n');
  const dataA = matrixToStringWithDims(matrixA, rowsA, colsA);
  const dataB = matrixToStringWithDims(matrixB, rowsB, colsB);

  // creazione job nel db
  await createJob(jobId, rowsA, colsA, colsB, dataA, dataB);

  // risposta immediata
  res.status(202).json({ jobId });

  // lancio il runner]
  setImmediate(() => {
    runner.start(jobId, { matrixA, matrixB, rowsA, colsA, colsB })
      .catch(err => console.error(`[${jobId}] Errore nel runner`, err));
  });
});

// avvio il server solo se index.js e' eseguito direttamente
// non per test
if(require.main === module){
  app.listen(PORT, () => {
    console.log('Server in ascolto sulla porta ' + PORT);
  });
}

module.exports = app;

// route da inserire dopo aver fatto getJoBById in Jo_repo

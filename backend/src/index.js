// mysql
require('dotenv').config();

// librerie
const express = require('express');
const path = require('path');
const fs = require('fs');
// debug
console.log('[EXISTS FALLBACK]',
  fs.existsSync(path.resolve(__dirname, '..', '..', 'worker', 'sermm_exec')),
  fs.existsSync(path.resolve(__dirname, '..', '..', 'worker', 'mpimm_exec'))
);
console.log('[CWD, __dirname]', process.cwd(), __dirname);
const { exec } = require('child_process');
const crypto = require('crypto');

// moduli db
const {
  createJob, getJobById, listJobs,
} = require('../database/job_repository.mysql');
// --- [BENCHMARK] import utility e servizi ---
const os = require('os');
const { parseListOrRange } = require('./utils/parseSpec');
const { validateCombinationLimit } = require('./utils/validateComboCap');

// Repo & runner benchmark
const { pool } = require('../database/db_mysql'); // riuso dello stesso pool MySQL
const { BenchmarkRepository } = require('../database/benchmark_repository.mysql');
const { BenchmarkRunner } = require('./benchmarks/benchmark_runner');

const benchmarkRepo = new BenchmarkRepository(pool);

const runner = require('./runner');

const app = express();
const cors = require('cors');
app.use(cors({ origin: ['http://127.0.0.1:5500','http://localhost:5500'] }));
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

// rotta “catch-all” per la home 
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

/**Query:
 * - status
 * - sort: asc | desc
 * - limit, offset
 */
app.get('/api/jobs', async (req, res) => {
  try {
    const { status, sort = 'desc', limit = 50, offset = 0, include } = req.query;

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

    const slim = (row) => {
      if(include === 'matrices')
        return row;
      const { matrix_a, matrix_b, result_c, ...light } = row;
      return light;
    };

    // items (plurale) e total coerenti
    res.json({
      total: rows.length,
      items: rows.map(slim),
    });
  } catch (error) {
    console.error('GET /api/jobs error ', error);
    res.status(500).json({ error: 'errore interno al db' });
  }
});


app.get('/api/jobs/:id', async (req, res) => {
  try {
    const { include } = req.query;
    const job = await getJobById(req.params.id);

    if (!job) return res.status(404).json({ error: 'not found' });

    // se l'utente vuole comunicazione pesante(con matrici)
    if(include === 'matrices')
      return res.json(job);

    // comunicazione leggera
    const { matrix_a, matrix_b, result_c, ...light } = job;
    return res.json(light);
  } catch (e) {
    console.error('GET /api/jobs/:id error', e);
    res.status(500).json({ error: 'db error' });
  }
});


app.post('/api/jobs', async (req, res) => {
  try {
    // 1) leggi il body
    const { matrixA, matrixB, mpiProcs: mpiProcsRaw } = req.body || {};
    console.log('POST /api/jobs body =', JSON.stringify(req.body));

    // 2) validazioni base
    if (!Array.isArray(matrixA) || !Array.isArray(matrixB)) {
      return res.status(400).json({ error: 'matrixA e matrixB devono essere array bidimensionali.' });
    }
    const rowsA = matrixA.length;
    const colsA = matrixA[0]?.length || 0;
    const rowsB = matrixB.length;
    const colsB = matrixB[0]?.length || 0;
    if (!rowsA || !colsA || !rowsB || !colsB) {
      return res.status(400).json({ error: 'Matrici vuote o mal formate.' });
    }
    if (colsA !== rowsB) {
      return res.status(400).json({ error: `Dimensioni non compatibili: A ${rowsA}x${colsA}, B ${rowsB}x${colsB}.` });
    }

    // 3) normalizza mpiProcs (default 4)
    const parsed = Number(mpiProcsRaw);
    const mpiProcs = Number.isFinite(parsed) && parsed > 0 ? parsed : 4;

    // 4) genera id e salva il job in DB
    const jobId = crypto.randomBytes(8).toString('hex');
    await createJob(jobId, rowsA, colsA, colsB, matrixA, matrixB);

    // 5) rispondi SUBITO e avvia runner async
    res.status(202).json({ jobId });
    console.log(`[${jobId}] Richiesta di calcolo ricevuta.`);

    setImmediate(() => {
      console.log(`[${jobId}] setImmediate INIZIO`);
      runner.start(jobId, {
        matrixA, matrixB,
        rowsA, colsA, colsB,
        mpiProcs,
        jobStartTime: Date.now(), // per exec_total_ms
      })
      .then(() => console.log(`[${jobId}] Runner finito`))
      .catch(err => console.error(`[${jobId}] Errore nel runner`, err));
    });
  } catch (err) {
    console.error('POST /api/jobs error', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});



// --- [BENCHMARK] Avvio di un batch di benchmark ---
// Body atteso: { seed?, sizes, procs, repeats?, oversubscribe? }
// - sizes: "128,256" oppure "128-1024:128"
// - procs: "2,4,8"  oppure "2-16:2"
app.post('/api/benchmarks/run', async (req, res) => {
  try {
    let { seed, sizes, procs, repeats, oversubscribe } = req.body || {};

    // Default: seed random; repeats = 5
    const seedToUse = Number.isInteger(seed) ? seed : Math.floor(Math.random() * 2**31);
    const repeatsToUse = Number.isInteger(repeats) && repeats > 0 ? repeats : 5;
    const oversub = !!oversubscribe;

    if (!sizes || !procs) {
      return res.status(400).json({ error: 'Fornisci "sizes" e "procs" (liste o range:step).' });
    }

    // Parse e validazioni
    const sizesList = parseListOrRange(sizes, { min: 2 });
    const procsList = parseListOrRange(procs, { min: 2 });
    validateCombinationLimit(sizesList, procsList, 100); // cap combinazioni

    // BatchId e profilo hw (salviamo per contesto)
    const batchId = `B${Date.now()}`;
    const hwProfile = {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus()?.length || null,
      totalmem: os.totalmem()
    };

    // Scrivo i metadati del batch a DB
    await benchmarkRepo.createBatch({
      batchId,
      seed: seedToUse,
      repeats: repeatsToUse,
      sizesExpr: sizes,
      procsExpr: procs,
      sizesList,
      procsList,
      oversubscribe: oversub,
      hwProfile
    });

    // Configuro il runner (binari e workdir via ENV, con default sensati)
    const runner = new BenchmarkRunner({
      repo: benchmarkRepo,
      config: {
        binSerial: process.env.BIN_SERIAL  || path.resolve(__dirname, '..', '..', 'worker', 'sermm_exec'),
        binMPI:    process.env.BIN_MPI     || path.resolve(__dirname, '..', '..', 'worker', 'mpimm_exec'),
        mpirun:    process.env.MPIRUN      || 'mpirun',
        workDir:   process.env.BENCH_WORKDIR || path.resolve(__dirname, '..', '..', 'worker', '.bench_work'),
        oversubscribe: oversub,
        repeats: repeatsToUse
      }
    });
    // debug
    console.log('[BENCH PATHS]',
      runner.config.binSerial,
      runner.config.binMPI,
      runner.config.workDir,
      'ENV BIN_SERIAL=', process.env.BIN_SERIAL
  );

    // Avvio la pipeline in sequenza (seriale + MPI) senza bloccare la risposta HTTP
    setImmediate(async () => {
      try {
        await runner.runBatch({
          batchId,
          seed: seedToUse,
          repeats: repeatsToUse,
          sizesList,
          procsList
        });
      } catch (err) {
        console.error(`[${batchId}] Errore batch:`, err);
        // In caso di crash globale, segno tutte le combinazioni come failed
        for (const n of sizesList) {
          for (const p of procsList) {
            try {
              await benchmarkRepo.markMPIFailed({
                batchId, n, p, errorMsg: `Errore batch: ${err.message}`
              });
            } catch {}
          }
        }
      }
    });

    // Risposta immediata al client con i parametri risolti
    return res.json({
      batchId,
      seed: seedToUse,
      repeats: repeatsToUse,
      sizes: sizesList,
      procs: procsList
    });

  } catch (err) {
    console.error('POST /api/benchmarks/run error', err);
    return res.status(400).json({ error: err.message || 'Errore avvio benchmark' });
  }
});

// --- [BENCHMARK] Recupero risultati di un batch ---
// Query: ?batchId=...
app.get('/api/benchmarks', async (req, res) => {
  try {
    const { batchId } = req.query || {};
    if (!batchId) return res.status(400).json({ error: 'Parametro batchId mancante.' });

    const data = await benchmarkRepo.getBatchResults(batchId);
    if (!data.batch) return res.status(404).json({ error: 'Batch non trovato.' });

    return res.json(data);
  } catch (err) {
    console.error('GET /api/benchmarks error', err);
    return res.status(500).json({ error: 'Errore recupero benchmark' });
  }
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

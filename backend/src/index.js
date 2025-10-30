require('dotenv').config();

// librerie
const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const os = require('os');

// service
const { pool } = require('../database/db_mysql');
const repo = require('../database/job_repository.mysql');
const { BenchmarkRepository } = require('../database/benchmark_repository.mysql');
const { BenchmarkRunner } = require('./benchmarks/benchmark_runner');
const { validateMatrixPair } = require('./utils/validate');
const { ensureDir } = require('./utils/compute_io');
const { parseListOrRange, validateCombinationLimit } = require('./utils/express_utils');
const runner = require('./runner');

// spp setup
const app = express();
app.use(express.json({ limit: '100mb' }));
const PORT = 3000;

// path e env
const frontendPath = path.join(__dirname, '../../frontend');
const workerDir = resolveWorkdir();
const jobsSub   = process.env.JOBS_SUBDIR || 'jobs';


app.use(express.static(frontendPath));

// routes welcome
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// debug info
console.log('[EXISTS FALLBACK]',
  fs.existsSync(path.resolve(__dirname, '..', '..', 'worker', 'sermm_exec')),
  fs.existsSync(path.resolve(__dirname, '..', '..', 'worker', 'mpimm_exec'))
);
console.log('[CWD, __dirname]', process.cwd(), __dirname);
console.log('[Runner config]',
  'MPIRUN=', process.env.MPIRUN || 'mpirun',
  'BIN_MPI=', process.env.BIN_MPI || path.resolve(__dirname,'..','..','worker','mpimm_exec'),
  'BIN_SERIAL=', process.env.BIN_SERIAL || path.resolve(__dirname,'..','..','worker','sermm_exec'),
  'WORKDIR=', process.env.WORKDIR || path.resolve(__dirname,'..','..','worker')
);

// services bench
const benchmarkRepo = new BenchmarkRepository(pool);

// helpers
function toAbs(p) {
  return path.isAbsolute(p) ? p : path.resolve(__dirname, '..', '..', p);
}
function resolveWorkdir() {
  const env = process.env.WORKDIR;
  if (env && path.isAbsolute(env)) return env;
  const base = path.resolve(__dirname, '..');
  return path.resolve(base, env || 'worker');
}
function extractMatrices(payloadJson, resultJson) {
  const A = payloadJson?.matrixA;
  const B = payloadJson?.matrixB;
  const C = resultJson?.resultC;
  return { matrix_a: A, matrix_b: B, result_c: C };
}
async function readJsonSafe(absPath) {
  if (!absPath) return { ok: false, error: 'empty path' };
  try {
    const text = await fsp.readFile(absPath, 'utf8');
    const json = JSON.parse(text);
    return { ok: true, json };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/* ----------------
      API
   ----------------
*/

// GET /api/jobs?status&sort&limit&offset&include&q
app.get('/api/jobs', async (req, res) => {
  try {
    const { status, sort = 'desc', limit = 50, offset = 0, include, q } = req.query;

    const allowed = [undefined, 'queued', 'running', 'completed', 'failed'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Parametro status non valido' });

    const s = String(sort).toLowerCase();
    if (!['asc', 'desc'].includes(s)) return res.status(400).json({ error: 'Parametro sort non valido' });

    const [rows, total] = await Promise.all([
      repo.listJobs({ status, sort: s, limit: Number(limit), offset: Number(offset), q }),
      repo.countJobs({ status, q }),
    ]);

    const slim = (row) => {
      if (include === 'matrices') return row;
      const { matrix_a, matrix_b, result_c, ...light } = row;
      return light;
    };

    res.json({ total, items: rows.map(slim) });
  } catch (error) {
    console.error('GET /api/jobs error', error);
    res.status(500).json({ error: 'errore interno al db' });
  }
});

// GET /api/jobs/:id?include=matrices
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const include = String(req.query.include || '').toLowerCase();
    const id = req.params.id;

    const job = await repo.getJobById(id);
    if (!job) return res.status(404).json({ error: 'not found' });

    if (include !== 'matrices') return res.json(job);

    const pay = await readJsonSafe(job.payload_path);
    const out = await readJsonSafe(job.result_path);
    const { matrix_a, matrix_b, result_c } = extractMatrices(
      pay.ok ? pay.json : null,
      out.ok ? out.json : null
    );

    return res.json({
      ...job,
      matrix_a,
      matrix_b,
      result_c,
      _files: {
        payload_path: job.payload_path,
        result_path: job.result_path,
        payload_read_ok: pay.ok,
        result_read_ok: out.ok,
        payload_error: pay.ok ? null : pay.err,
        result_error: out.ok ? null : out.err,
      },
    });
  } catch (e) {
    console.error('GET /api/jobs/:id error', e);
    res.status(500).json({ error: 'db error' });
  }
});

// POST /api/jobs
app.post('/api/jobs', async (req, res) => {
  try {
    const { matrixA, matrixB, mpiProcs: mpiProcsRaw } = req.body || {};
    const err = validateMatrixPair(matrixA, matrixB);
    if (err) return res.status(400).json({ error: err });

    const nra = matrixA.length, nca = matrixA[0].length;
    const nrb = matrixB.length, ncb = matrixB[0].length;
    const mpiProcs = Number(mpiProcsRaw) || Number(process.env.MPI_PROCESS_DEFAULT) || 4;

    const jobId = crypto.randomBytes(8).toString('hex');
    const jobDir = path.join(workerDir, jobsSub, jobId);
    ensureDir(jobDir);

    const payload = { matrixA, matrixB, mpiProcs, jobStartTime: Date.now() };
    const payloadPath = path.join(jobDir, 'payload.json');
    fs.writeFileSync(payloadPath, JSON.stringify(payload));
    console.log('[POST] payloadPath =', payloadPath, 'exists=', fs.existsSync(payloadPath));

    await repo.createJob({
      id: jobId, nra, nca, ncb, mpiProcs,
      payload_path: payloadPath,
      result_path: null
    });

    res.status(202).json({ jobId });
    console.log(`[${jobId}] Richiesta di calcolo ricevuta.`);

    runner.start(jobId, { jobStartTime: payload.jobStartTime });
  } catch (err) {
    console.error('POST /api/jobs error', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// POST /api/benchmarks/run
app.post('/api/benchmarks/run', async (req, res) => {
  try {
    let { seed, sizes, procs, repeats, oversubscribe } = req.body || {};

    const seedToUse = Number.isInteger(seed) ? seed : Math.floor(Math.random() * 2**31);
    const repeatsToUse = Number.isInteger(repeats) && repeats > 0 ? repeats : 5;
    const oversub = !!oversubscribe;

    if (!sizes || !procs) {
      return res.status(400).json({ error: 'Fornisci "sizes" e "procs" (liste o range:step).' });
    }

    const sizesList = parseListOrRange(sizes, { min: 2 });
    const procsList = parseListOrRange(procs, { min: 2 });
    validateCombinationLimit(sizesList, procsList, 100);

    const batchId = `B${Date.now()}`;
    const hwProfile = {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus()?.length || null,
      totalmem: os.totalmem()
    };

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

    const runner = new BenchmarkRunner({
      repo: benchmarkRepo,
      config: {
        binSerial: toAbs(process.env.BIN_SERIAL  || 'worker/sermm_exec'),
        binMPI:    toAbs(process.env.BIN_MPI    || 'worker/mpimm_exec'),
        mpirun:    process.env.MPIRUN           || 'mpirun',
        workDir:   toAbs(process.env.BENCH_WORKDIR || 'worker/.bench_work'),
        oversubscribe: oversub,
        repeats: repeatsToUse
      }
    });

    console.log('[BENCH PATHS]',
      runner.config.binSerial,
      runner.config.binMPI,
      runner.config.workDir,
      'ENV BIN_SERIAL=', process.env.BIN_SERIAL
    );

    setImmediate(async () => {
      try {
        await runner.runBatch({ batchId, seed: seedToUse, repeats: repeatsToUse, sizesList, procsList });
      } catch (err) {
        console.error(`[${batchId}] Errore batch:`, err);
        for (const n of sizesList) {
          for (const p of procsList) {
            try {
              await benchmarkRepo.upsertResult({
                batchId, n, mode: 'mpi', p,
                status: 'failed',
                errorMsg: `Errore batch: ${err.message}`
              });
            } catch {}
          }
        }
      }
    });

    return res.json({ batchId, seed: seedToUse, repeats: repeatsToUse, sizes: sizesList, procs: procsList });
  } catch (err) {
    console.error('POST /api/benchmarks/run error', err);
    return res.status(400).json({ error: err.message || 'Errore avvio benchmark' });
  }
});

// GET /api/benchmarks?batchId=...
app.get('/api/benchmarks', async (req, res) => {
  try {
    const { batchId } = req.query || {};
    if (!batchId) return res.status(400).json({ error: 'Parametro batchId mancante.' });

    const { batch, results } = await benchmarkRepo.getBatchResults(batchId);
    if (!batch) return res.status(404).json({ error: 'Batch non trovato.' });

    const TsByN = new Map();
    for (const r of results) {
      if (r.mode === 'serial' && r.status === 'ok' && r.time_ms != null) {
        TsByN.set(r.n, r.time_ms);
      }
    }

    const enriched = results.map(r => {
      if (r.mode === 'mpi' && r.status === 'ok' && r.time_ms != null && TsByN.has(r.n)) {
        const Ts = TsByN.get(r.n);
        const speedup = Ts / r.time_ms;
        const efficiency = speedup / r.p;
        return { ...r, speedup, efficiency };
      }
      return r;
    });

    return res.json({ batch, results: enriched });
  } catch (err) {
    console.error('GET /api/benchmarks error', err);
    return res.status(500).json({ error: 'Errore recupero benchmark' });
  }
});

// start
if (require.main === module) {
  app.listen(PORT, () => {
    console.log('Server in ascolto sulla porta ' + PORT);
  });
}

module.exports = app;

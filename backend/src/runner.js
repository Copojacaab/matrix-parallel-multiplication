// ================================================
// RUNNER - Avvio ed esecuzione di un job di moltiplicazione matriciale
// ================================================
//
// Flusso:
//  1) Aggiorna stato RUNNING nel DB MySQL
//  2) Scrive i file A.txt e B.txt nella cartella /worker
//  3) Lancia il programma MPI (mpimm_exec) con mpirun
//  4) Se fallisce, ripiega sul binario seriale (sermm_exec)
//  5) Legge il file di output C.txt e aggiorna il DB con risultato e tempi
//  6) Cancella i file temporanei
//
// Tutto il codice è altamente commentato e con log esplicativi.

const path = require('path');
const fs = require('fs');
const util = require('util');
const execAsync = util.promisify(require('child_process').exec);

// === Repositories MySQL ===
const {
  updateJobRunning,
  updateJobSuccess,
  updateJobFailure,
} = require('../database/job_repository.mysql');

// === Utilità per I/O matrici ===
const {
  writeMatrixTxt,
  parseOutputMatrix,
  parseComputeMs,
  ensureDir,
  safeUnlink,
} = require('./utils/compute_io');

// === CONFIGURAZIONE ===
// Percorsi assoluti dei binari MPI e seriale (come da tua macchina)
const MPIRUN_PATH = '/usr/bin/mpirun';
const BIN_MPI = '/home/giannuxmini/Documents/PROJECTS/UNI_PROJECTS/Progetto_SDEP_semplificato/matrix-parallel-multiplication/worker/mpimm_exec';
const BIN_SER = '/home/giannuxmini/Documents/PROJECTS/UNI_PROJECTS/Progetto_SDEP_semplificato/matrix-parallel-multiplication/worker/sermm_exec';

// Cartella di lavoro (dove scrivere i file temporanei)
const workerDir = path.join(__dirname, '..', '..', 'worker');
ensureDir(workerDir);

// === FUNZIONE PRINCIPALE ===
async function start(jobId, payload) {
  console.log(`[${jobId}] Runner avviato`);

  // Passaggio 1: aggiorna stato RUNNING nel DB
  await updateJobRunning(jobId);

  // Costruisci percorsi dei file
  const baseA = path.join(workerDir, `matrice_a_${jobId}.txt`);
  const baseB = path.join(workerDir, `matrice_b_${jobId}.txt`);
  const baseC = path.join(workerDir, `matrice_c_${jobId}.txt`);

  try {
    // Passaggio 2: scrivi i file A e B
    writeMatrixTxt(baseA, payload.matrixA);
    writeMatrixTxt(baseB, payload.matrixB);
    console.log(`[${jobId}] File input creati:\n - ${baseA}\n - ${baseB}`);

    // Passaggio 3: prepara ed esegui il comando MPI
    const mpiProcs = payload.mpiProcs || 4; // default: 4 processi
    const cmdMpi = `${MPIRUN_PATH} -n ${mpiProcs} --oversubscribe ${BIN_MPI} ${baseA} ${baseB} ${baseC}`;
    console.log(`[${jobId}] Eseguo: ${cmdMpi}`);

    const tStartExec = Date.now();
    let stdout = '';
    try {
      const res = await execAsync(cmdMpi, { cwd: workerDir });
      stdout = res.stdout;
    } catch (err) {
      // Passaggio 4: se MPI fallisce, fallback al seriale
      console.warn(`[${jobId}] ⚠️ mpirun fallito (${err.message}), provo seriale...`);
      const cmdSer = `${BIN_SER} ${baseA} ${baseB} ${baseC}`;
      console.log(`[${jobId}] Eseguo seriale: ${cmdSer}`);
      const resSer = await execAsync(cmdSer, { cwd: workerDir });
      stdout = resSer.stdout;
    }
    const tEndExec = Date.now();
    const executionTime = tEndExec - tStartExec; //tempo totale della exec

    // Passaggio 5: leggi la matrice C e calcola i tempi
    const rawC = fs.readFileSync(baseC, 'utf8');
    const { matrix: resultC } = parseOutputMatrix(rawC);
    const computeTime = parseComputeMs(stdout) ?? null;

    // tempo totale del job (end-to-end)
    const execTotalTime = Date.now() - payload.jobStartTime;

    console.log(`[${jobId}] Computazione completata. Tempo MPI=${computeTime} ms`);
    console.log(`[${jobId}] Matrice risultato (${resultC.length}x${resultC[0].length}) calcolata.`);

    // Aggiorna DB come successo
    await updateJobSuccess(jobId, {
      result_c: resultC,
      compute_time_ms: computeTime,
      execution_time_ms: executionTime,
      exec_total_ms: execTotalTime,
    });

  } catch (err) {
    // Se qualcosa fallisce, salva errore su DB
    console.error(`[${jobId}] ❌ Errore durante il runner:`, err);
    await updateJobFailure(jobId, {
      error_msg: err.message,
      exec_total_ms: Date.now() - payload.jobStartTime
    });
  } finally {
    // Passaggio 6: pulizia file temporanei
    safeUnlink(baseA);
    safeUnlink(baseB);
    safeUnlink(baseC);
    console.log(`[${jobId}] Pulizia file temporanei completata.`);
  }
}

module.exports = { start };

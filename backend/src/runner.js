/**
 * Runner: esegue il lavoro pesante in background per un job:
 * Pipeline:
 * 1. aggiorna stato job a running
 * 2. scrive i file A e B nel folder /worker
 * 3. lancia mpirun 
 * 4. legge il file C e lo converte in matrice
 * 5. aggiorna il db con success o failure
 * 6. cleanup file temp
 */

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { parseComputeMs } = require('./utils/parseCompute');
const { updateJobRunning, 
    updateJobSuccess, updateJobFailure } = require('../database/job_repository.mysql'); 
const { stdout } = require('process');
// ---------------------------- HELPER ------------------------
function matrixToTxt(matrix) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const body = matrix.map(r => r.join(' ')).join('\n');
  return `${rows} ${cols}\n${body}\n`;
}


function parseResultTxt(txt){
  const lines = txt.trim().split('\n');
  const dataLines = lines.slice(1); // salta "R C"
  return dataLines.map(line => line.trim().split(/\s+/).map(Number));
}


function execAsync(cmd, opts) {
    return new Promise((resolve, reject) => {
        exec(cmd, opts, (err, stdout, stderr) => {
            if(err)
                return reject(err);
            resolve({ stdout, stderr })
        });
    });
}
// best - effort
async function safeUnlink(filePath){
    try{
        await fs.promises.unlink(filePath); 
    }catch (_){}
}

// -------------------------------------------- RUNNER -----------------------------
/**
 * Avvia l’esecuzione di un job.
 * @param {string} jobId - l’identificativo del job
 * @param {object} payload - parametri/inputs del job
 *   payload.matrixA : number[][]
 *   payload.matrixB : number[][]
 *   payload.rowsA, payload.colsA, payload.colsB: (facoltativi; li possiamo ricalcolare)
 */
async function start(jobId, payload){
    const t0 = Date.now();

    const workerDir = path.join(__dirname, '..', '..', 'worker'); //controlla path in caso di errori

    // nomi file univoci
    const baseA = `matrice_a_${jobId}.txt`;
    const baseB = `matrice_b_${jobId}.txt`;
    const baseC = `matrice_c_${jobId}.txt`;

    const fileA = path.join(workerDir, baseA);
    const fileB = path.join(workerDir, baseB);
    const fileC = path.join(workerDir, baseC);

    console.log(`[${jobId}] Runner avviato`);

    try{
        // 1 Stato --> running
        await updateJobRunning(jobId);
        console.log(`[${jobId}] Stato aggiornato a running`)

        // 2 scrivi A e B
        const txtA = matrixToTxt(payload.matrixA);
        const txtB = matrixToTxt(payload.matrixB);
        await fs.promises.writeFile(fileA, txtA, 'utf8');
        await fs.promises.writeFile(fileB, txtB, 'utf8');
        console.log(`[${jobId}] File input creati:\n  - ${fileA}\n  - ${fileB}`);

        // 3 eseguo mpirun
        const cmd = `/usr/bin/mpirun -n 4 --oversubscribe ./mpimm_exec ${baseA} ${baseB} ${baseC}`;
        console.log(`[${jobId}] Eseguo: ${cmd}`);
        const { stdout } = await execAsync(cmd, { cwd: workerDir });
        if (stdout) console.log(`[${jobId}] Output C:\n${stdout}`);

        // 4) Leggi e parsa il risultato
        const outTxt = await fs.promises.readFile(fileC, 'utf8');
        const resultMatrix = parseResultTxt(outTxt);
        console.log(`[${jobId}] Risultato letto da ${fileC}`);
        
        // NB: salviamo il risultato come JSON in DB (pratico da ritornare al client)
        const completedAt = new Date();
        const execTotalMs = Date.now() - t0;

        // tempo compute dal binario
        const computeMs = parseComputeMs(stdout);
        // debug
        console.log('[runner] stdout: \n', stdout);
        console.log('[runner] computeMs: ' ,computeMs);
        await updateJobSuccess(jobId, JSON.stringify(resultMatrix), completedAt, { computeMs, execTotalMs });

    }catch (err) {
        // 5 in caso di failure
        const completedAt = new Date();
        const execTotalMs = Date.now() - t0;

        console.error(`[${jobId}] Errore nel runner `, err);
        await updateJobFailure(jobId, completedAt, { execTotalMs });
    } finally {
        // 6) Pulizia file temporanei (best-effort)
        await safeUnlink(fileA);
        await safeUnlink(fileB);
        await safeUnlink(fileC);
        console.log(`[${jobId}] Pulizia file temporanei completata`);
    }
}

module.exports = { start };

// -----------------------------------------------------------------------------
// TEST RAPIDO (solo se eseguito direttamente con: node benchmark_runner.js)
// -----------------------------------------------------------------------------
if (require.main === module) {
  (async () => {
    console.log('▶️ Test runner standalone avviato');

    const matrixA = [
      [1, 2],
      [3, 4],
    ];
    const matrixB = [
      [5, 6],
      [7, 8],
    ];

    // Mock molto semplice delle funzioni DB
    const fakeJobId = 'testJob';
    global.updateJobRunning = async (id) => console.log(`[DB] updateJobRunning(${id})`);
    global.updateJobSuccess = async (id, result, completedAt, execTotalMs, computeMs) => {
      console.log(`[DB] updateJobSuccess(${id})`);
      console.log(`  execTotalMs = ${execTotalMs} ms`);
      console.log(`  computeMs   = ${computeMs} ms`);
      console.log(`  result =`, JSON.parse(result));
    };
    global.updateJobFailure = async (id, completedAt, execMs) => {
      console.log(`[DB] updateJobFailure(${id})`);
    };

    // Mock parseComputeMs per evitare import
    const { parseComputeMs } = require('../utils/parseCompute');

    // Esegui il runner
    try {
      const { start } = require('./benchmark_runner'); // importa se necessario
      await start(fakeJobId, { matrixA, matrixB });
    } catch (err) {
      console.error('❌ Errore durante il test runner:', err);
    }
  })();
}

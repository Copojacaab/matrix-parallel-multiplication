const path = require('path');
const fs = require('fs');
const util = require('util');
const execAsync = util.promisify(require('child_process').exec);
const { spawn } = require('child_process');

const {
  updateJobRunning,
  updateJobSuccess,
  updateJobFailure,
} = require('../database/job_repository.mysql');

const {
  writeMatrixTxt,
  parseOutputMatrix,
  parseComputeMs,
  ensureDir,
  safeUnlink,
} = require('./utils/compute_io');

const projectRoot = path.resolve(__dirname, '..', '..');
const MPIRUN_PATH = process.env.MPIRUN || 'mpirun';

function toAbs(p) {
  return path.isAbsolute(p) ? p : path.resolve(projectRoot, p);
}
function resolveWorkdir() {
  const env = process.env.WORKDIR;
  if (env && path.isAbsolute(env)) return env;
  const base = path.resolve(__dirname, '..');
  return path.resolve(base, env || 'worker');
}

const workerDir = resolveWorkdir();
const jobsSub   = process.env.JOBS_SUBDIR || 'jobs';
const BIN_MPI   = toAbs(process.env.BIN_MPI   || 'worker/mpimm_exec');
const BIN_SER   = toAbs(process.env.BIN_SERIAL|| 'worker/sermm_exec');

ensureDir(workerDir);

function runSpawn(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { shell: false, ...opts });
    let stdout = '', stderr = '';
    child.stdout?.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr?.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

async function start(jobId, meta) {
  console.log(`[${jobId}] Runner avviato`);
  console.log('[Runner paths]',
    'Project Root=', projectRoot,
    'MPIRUN=', MPIRUN_PATH,
    'BIN_MPI=', BIN_MPI,
    'BIN_SERIAL=', BIN_SER,
    'WORKDIR=', workerDir
  );
  console.log('[Exists?]',
    'BIN_MPI:', fs.existsSync(BIN_MPI),
    'BIN_SERIAL:', fs.existsSync(BIN_SER),
    'WORKDIR:', fs.existsSync(workerDir)
  );

  await updateJobRunning(jobId);

  const jobDir = path.join(workerDir, jobsSub, jobId);
  ensureDir(jobDir);

  const baseA = path.join(jobDir, 'A.txt');
  const baseB = path.join(jobDir, 'B.txt');
  const baseC = path.join(jobDir, 'C.txt');
  const payloadPath = path.join(jobDir, 'payload.json');
  const resultPath  = path.join(jobDir, 'result.json');

  try {
    const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
    writeMatrixTxt(baseA, payloadData.matrixA);
    writeMatrixTxt(baseB, payloadData.matrixB);
    console.log(`[${jobId}] File input creati:\n - ${baseA}\n - ${baseB}`);

    const mpiProcs = payloadData.mpiProcs || Number(process.env.MPI_PROCESS_DEFAULT) || 4;
    const oversub  = (process.env.OVERSUBSCRIBE || 'true').toLowerCase() !== 'false';

    const mpiArgs = ['-n', String(mpiProcs)];
    if (oversub) mpiArgs.push('--oversubscribe');
    mpiArgs.push(BIN_MPI, baseA, baseB, baseC);
    console.log(`[${jobId}] Eseguo ${MPIRUN_PATH} ${mpiArgs.join(' ')}`);

    const tStartExec = Date.now();

    let stdout = '';
    const runMpi = await runSpawn(MPIRUN_PATH, mpiArgs, { cwd: jobDir });

    if (runMpi.code === 0) {
      stdout = runMpi.stdout;
    } else {
      const errMsg = (runMpi.stderr || '').trim() || `mpirun exited with code ${runMpi.code}`;
      console.warn(`[${jobId} mpirun fallito (${errMsg}) provo con seriale]`);

      const serArgs = [baseA, baseB, baseC];
      console.log(`[${jobId}] Eseguo seriale: ${BIN_SER} ${serArgs.join(' ')}`);

      const runSer = await runSpawn(BIN_SER, serArgs, { cwd: jobDir });
      if (runSer.code !== 0) {
        const e = new Error((runSer.stderr || '').trim() || `seriale exited with code ${runSer.code}`);
        e.code = runSer.code;
        throw e;
      }
      stdout = runSer.stdout;
    }

    const tEndExec = Date.now();
    const executionTime = tEndExec - tStartExec;

    const rawC = fs.readFileSync(baseC, 'utf8');
    const { matrix: resultC } = parseOutputMatrix(rawC);
    const computeTime = parseComputeMs(stdout) ?? null;

    const execTotalTime = Date.now() - payloadData.jobStartTime;

    console.log(`[${jobId}] Computazione completata. Tempo MPI=${computeTime} ms`);
    console.log(`[${jobId}] Matrice risultato (${resultC.length}x${resultC[0].length}) calcolata.`);

    fs.writeFileSync(resultPath, JSON.stringify({ resultC, computeTime, executionTime, execTotalTime }));

    await updateJobSuccess(jobId, {
      result_path: resultPath,
      compute_time_ms: computeTime,
      execution_time_ms: executionTime,
      exec_total_ms: execTotalTime,
    });

  } catch (err) {
    console.error(`[${jobId}] ❌ Errore durante il runner:`, err);
    await updateJobFailure(jobId, {
      error_msg: err.message,
      exec_total_ms: Date.now() - meta.jobStartTime
    });
  } finally {
    safeUnlink(baseA);
    safeUnlink(baseB);
    safeUnlink(baseC);
    console.log(`[${jobId}] Pulizia file temporanei completata.`);
  }
}

module.exports = { start };

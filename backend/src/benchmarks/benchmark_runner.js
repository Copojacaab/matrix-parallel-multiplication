// salva: pending e poi ok/failed per seriale (p=1 mode='serial') e MPI (mode='mpi' p vari)
// calcola la mediana dopo eliminazione warm up, salva anche i samples post-warmup

const path = require('path');
const fs = require('fs');
const { generateAB, medianAfterWarmup } = require('../utils/bench_utils');     
const { runCommand, ensureDir, safeUnlink } = require('../utils/compute_io');  

async function runCommandTimed(command, args, options = {}) {
  const t0 = Date.now();
  const { exitCode, stdout, stderr } = await runCommand(command, args, options);
  if (exitCode !== 0) {
    const msg = (stderr || '').trim() || `Process exited with code ${exitCode}`;
    throw new Error(msg);
  }
  return { execTimeMs: Date.now() - t0, stdout };
}

class BenchmarkRunner {
  /**
   * @param {{ repo: , 
   *          config: {
   *            binSerial: string, binMPI: string, mpirun: string,
   *            workDir: string, oversubscribe: boolean, repeats: number
   * }}} 
   */
  constructor({ repo, config }) {
    this.repo = repo;
    this.config = config;
    ensureDir(this.config.workDir);
  }

  // esegue un comando e ritorna il tempo di esecuzione in millisecondi
  async runCommandTimed(command, args) {
    const t0 = Date.now();
    const { exitCode, stdout, stderr } = await runCommand(command, args, { cwd: this.config.workDir });
    if (exitCode !== 0) {
      const msg = (stderr || '').trim() || `Process exited with code ${exitCode}`;
      throw new Error(msg);
    }
    const t1 = Date.now();
    return { execTimeMs: t1 - t0, stdout };
  }

  // k volte lo stesso comando e array tempi
  async runRepeated(command, args, repeats) {
    const samples = [];
    for (let i = 0; i < repeats; i++) {
      try {
        const { execTimeMs } = await this.runCommandTimed(command, args);
        samples.push(execTimeMs);
      } catch (err) {
        // un singolo retry soft per la run corrente
        const { execTimeMs } = await this.runCommandTimed(command, args);
        samples.push(execTimeMs);
      }
    }
    return samples;
  }

  // run seriale e calcola Ts
  async runSerialOnce(seed, n, repeats) {
    const { workDir, binSerial } = this.config;
    const { pathA, pathB } = generateAB(seed, n, workDir);
    const pathC = path.join(workDir, `C_ser_${n}.txt`);

    const args = [pathA, pathB, pathC];
    const samplesAll = await this.runRepeated(binSerial, args, repeats);
    const Ts = medianAfterWarmup(samplesAll);
    const samplesPost = samplesAll.slice(1);

    safeUnlink(pathC);
    return { Ts, samplesPost };
  }

  // run mpi con p processio e calcola Tp 
  async runMPIOnce(seed, n, p, repeats) {
    const { workDir, binMPI, mpirun, oversubscribe } = this.config;
    const { pathA, pathB } = generateAB(seed, n, workDir);
    const pathC = path.join(workDir, `C_mpi_${n}_${p}.txt`);

    const mpiArgs = ['-n', String(p)];
    if (oversubscribe) mpiArgs.push('--oversubscribe');
    mpiArgs.push(binMPI, pathA, pathB, pathC);

    const samplesAll = await this.runRepeated(mpirun, mpiArgs, repeats);
    const Tp = medianAfterWarmup(samplesAll);
    const samplesPost = samplesAll.slice(1);

    safeUnlink(pathC);
    return { Tp, samplesPost };
  }

  // esegue l'intero batch 
  async runBatch({ batchId, seed, repeats, sizesList, procsList }) {
    for (const n of sizesList) {
      // SERIAL (p=1)
      try {
        await this.repo.upsertResult({ batchId, n, mode: 'serial', p: 1, status: 'pending' });

        const { Ts, samplesPost } = await this.runSerialOnce(seed, n, repeats);
        await this.repo.upsertResult({
          batchId, n, mode: 'serial', p: 1,
          status: 'ok', timeMs: Ts, samples: samplesPost
        });
      } catch (err) {
        await this.repo.upsertResult({
          batchId, n, mode: 'serial', p: 1,
          status: 'failed', errorMsg: `Seriale n=${n} fallita: ${err.message}`
        });
      }

      // MPI (per ogni p)
      for (const p of procsList) {
        try {
          await this.repo.upsertResult({ batchId, n, mode: 'mpi', p, status: 'pending' });

          const { Tp, samplesPost } = await this.runMPIOnce(seed, n, p, repeats);
          await this.repo.upsertResult({
            batchId, n, mode: 'mpi', p,
            status: 'ok', timeMs: Tp, samples: samplesPost
          });
        } catch (err) {
          await this.repo.upsertResult({
            batchId, n, mode: 'mpi', p,
            status: 'failed', errorMsg: `MPI n=${n}, p=${p} fallita: ${err.message}`
          });
        }
      }
    }
  }
}

module.exports = { BenchmarkRunner };

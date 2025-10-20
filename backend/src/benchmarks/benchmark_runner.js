// src/benchmarks/benchmark_runner.js
// Runner benchmark "snello": usa SOLO repo.upsertResult(...)
// Salva: pending → ok/failed per seriale (p=1, mode='serial') e MPI (mode='mpi', p vari)
// Calcola la mediana "post-warmup" con medianAfterWarmup e salva anche i samples post-warmup.

const path = require('path');
const fs = require('fs');
const { generateAB, medianAfterWarmup } = require('../utils/bench_utils');     // ✔ util presenti
const { runCommand, ensureDir, safeUnlink } = require('../utils/compute_io');  // ✔ runCommand disponibile

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
   * @param {{ repo: any, config: {
   *   binSerial: string, binMPI: string, mpirun: string,
   *   workDir: string, oversubscribe: boolean, repeats: number
   * }}} deps
   */
  constructor({ repo, config }) {
    this.repo = repo;
    this.config = config;
    ensureDir(this.config.workDir);
  }

  // Esegue un comando e ritorna il tempo di esecuzione in millisecondi
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

  // K volte lo stesso comando → array dei tempi
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

  // Run seriale su (A,B)->C e calcola Ts (mediana post-warmup)
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

  // Run MPI con p processi e calcola Tp (mediana post-warmup)
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

  // Esegue l'intero batch in sequenza con upsertResult(...)
  async runBatch({ batchId, seed, repeats, sizesList, procsList }) {
    for (const n of sizesList) {
      // --- SERIAL (p=1)
      try {
        // opzionale: mostra placeholder "in corso"
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
        // si può continuare comunque con MPI su questo n (magari per evidenziare l'errore accanto)
      }

      // --- MPI (per ogni p)
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

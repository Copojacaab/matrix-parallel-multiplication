// services/benchmark_runner.js
// Scopo: eseguire l'intero batch in sequenza, generando A/B, lanciando seriale e MPI,
//        misurando tempi e salvando i risultati tramite il repository.
//
// Dipendenze:
//  - BenchmarkRepository (iniezione nel costruttore)
//  - generateAB (utils/matrixGen)
//  - runCommandTimed (utils/runCmd)
//  - medianAfterWarmup (utils/metrics)

const path = require('path');
const fs = require('fs');
const { generateAB } = require('../utils/matrixGen');
const { runCommandTimed } = require('../utils/runCmd');
const { medianAfterWarmup } = require('../utils/metrics');

class BenchmarkRunner {
  /**
   * @param {Object} deps
   * @param {BenchmarkRepository} deps.repo
   * @param {Object} deps.config - percorsi binari e opzioni
   *   {
   *     binSerial: string,                // es. "./sermm_exec"
   *     binMPI: string,                   // es. "./mpimm_exec"
   *     mpirun: string,                   // es. "mpirun"
   *     workDir: string,                  // dir in cui creare i file A/B/C
   *     oversubscribe: boolean,
   *     repeats: number
   *   }
   */
  constructor({ repo, config }) {
    this.repo = repo;
    this.config = config;
  }

  // Esegue k volte un comando e ritorna i k tempi in ms.
  async runRepeated(file, args, repeats) {
    const samples = [];
    for (let i = 0; i < repeats; i++) {
      try {
        const { execTimeMs } = await runCommandTimed(file, args);
        samples.push(execTimeMs);
      } catch (err) {
        // fall-back: ritenta una volta la singola run
        try {
          const { execTimeMs } = await runCommandTimed(file, args);
          samples.push(execTimeMs);
        } catch (err2) {
          // propaga l'errore al chiamante (gestito a livello (n) o (n,p))
          err2.firstError = err;
          throw err2;
        }
      }
    }
    return samples;
  }

  // Esegue il seriale su (A,B)->C e calcola Ts (mediana dopo warm-up).
  async runSerialOnce(seed, n, repeats) {
    // debug
    console.log('[RUN SERIAL]', this.config.binSerial);
    console.log('[RUN MPI]', this.config.mpirun, this.config.binMPI);

    const { workDir, binSerial } = this.config;
    const { pathA, pathB } = generateAB(seed, n, workDir);
    const pathC = path.join(workDir, `C_ser_${n}.txt`);
    const args = [pathA, pathB, pathC];

    const samples = await this.runRepeated(binSerial, args, repeats);
    const Ts = medianAfterWarmup(samples);

    // opzionale: rimuovere C per risparmiare spazio
    try { fs.unlinkSync(pathC); } catch {}

    return { Ts, samples };
  }

  // Esegue MPI con p processi e calcola Tp (mediana dopo warm-up).
  async runMPIOnce(seed, n, p, repeats) {
    // debug
    console.log('[RUN SERIAL]', this.config.binSerial);
    console.log('[RUN MPI]', this.config.mpirun, this.config.binMPI);

    const { workDir, binMPI, mpirun, oversubscribe } = this.config;
    const { pathA, pathB } = generateAB(seed, n, workDir);
    const pathC = path.join(workDir, `C_mpi_${n}_${p}.txt`);

    // Costruiamo gli argomenti per mpirun
    const mpiArgs = ['-n', String(p)];
    if (oversubscribe) mpiArgs.push('--oversubscribe');
    mpiArgs.push(binMPI, pathA, pathB, pathC);

    const samples = await this.runRepeated(mpirun, mpiArgs, repeats);
    const Tp = medianAfterWarmup(samples);

    try { fs.unlinkSync(pathC); } catch {}

    return { Tp, samples };
  }

  // Esegue l'intero batch (in sequenza)
  async runBatch({ batchId, seed, repeats, sizesList, procsList }) {
    // 1) Serial per ogni n
    for (const n of sizesList) {
      let Ts, serialSamples;
      try {
        ({ Ts, samples: serialSamples } = await this.runSerialOnce(seed, n, repeats));
        await this.repo.upsertSerial({ batchId, n, Ts_ms: Ts, samples: serialSamples.slice(1) /* solo post warm-up */ });
      } catch (err) {
        // Anche se la seriale fallisce su n, registriamo l'errore su tutte le p per trasparenza e proseguiamo
        for (const p of procsList) {
          await this.repo.createPendingMPI({ batchId, n, p });
          await this.repo.markMPIFailed({ batchId, n, p, errorMsg: `Seriale fallita su n=${n}: ${err.message}` });
        }
        continue; // vai al prossimo n
      }

      // 2) MPI per ogni p
      for (const p of procsList) {
        await this.repo.createPendingMPI({ batchId, n, p });
        try {
          const { Tp, samples } = await this.runMPIOnce(seed, n, p, repeats);
          const speedup = Ts / Tp;
          const efficiency = speedup / p;
          await this.repo.markMPIOk({
            batchId, n, p,
            Tp_ms: Tp,
            speedup,
            efficiency,
            samples: samples.slice(1) // solo post warm-up
          });
        } catch (err) {
          await this.repo.markMPIFailed({
            batchId, n, p,
            errorMsg: `MPI fallita su n=${n}, p=${p}: ${err.message}`
          });
          // Continuiamo con gli altri p (fallimento isolato)
        }
      }
    }
  }
}

module.exports = { BenchmarkRunner };


// Test manuale: eseguito solo se il file è lanciato direttamente
if (require.main === module) {
  console.log('🧪 Avvio test manuale BenchmarkRunner');

  // Mock semplificato per test
  const repo = {
    upsertSerial: async d => console.log('📘 upsertSerial', d),
    createPendingMPI: async d => console.log('🟡 createPendingMPI', d),
    markMPIOk: async d => console.log('✅ markMPIOk', d),
    markMPIFailed: async d => console.log('❌ markMPIFailed', d)
  };

  const config = {
    binSerial: './sermm_exec',
    binMPI: './mpimm_exec',
    mpirun: 'mpirun',
    workDir: './worker/io',
    oversubscribe: false,
    repeats: 3
  };

  const runner = new BenchmarkRunner({ repo, config });

  // Mock: sostituisco runCommandTimed per simulare un’esecuzione veloce
  const { runCommandTimed } = require('../utils/runCmd');
  runner.runRepeated = async () => [100, 90, 110]; // tempi finti

  // Eseguo un batch di esempio
  (async () => {
    await runner.runBatch({
      batchId: 'test001',
      seed: 42,
      repeats: 3,
      sizesList: [100, 200],
      procsList: [1, 2]
    });
  })().then(() => console.log('✅ Test completato')).catch(console.error);
}

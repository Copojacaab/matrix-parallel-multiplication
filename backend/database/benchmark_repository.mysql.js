// Scopo: incapsulare l'accesso alle tabelle benchmarks

class BenchmarkRepository {
  /**
   * @param {import('mysql2/promise').Pool} pool
   */

  constructor(pool) {
    this.pool = pool;
  }

  async creteBatch({
    batchId,
    seed,
    repeats,
    sizesExpr,
    procsExpr,
    sizesJson,
    procsJson,
    oversubscribe,
    hwProfile,
  }) {
    const sql = `
                INSERT INTO benchmark_batches 
                (batch_id, seed, repeats, sizes_expr, procs_expr, sizes_jsob, procs_json, oversubscribe, hw_profile)
                VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, ?) 
            `;

    await this.pool(
      execute(sql, [
        batchId,
        seed,
        repeats,
        sizesExpr,
        procsExpr,
        JSON.stringify(sizesJson),
        JSON.stringify(procsJson),
        oversubscribe ? 1 : 0,
        hwProfile ? JSON.stringify(hwProfile) : null,
      ])
    );
  }

  async upsertSerial({ batchId, n, Ts_ms, samples }) {
    const sql = `
            INSERT INTO benchmark_serial (batch_id, n, Ts_ms, samples_json)
            VALUES (?, ?, ?, CAST(? AS JSON))
            ON DUPLICATE KEY UPDATE Ts_ms = VALUES(Ts_ms), samples_json = VALUES(samples_json)
        `;

    await this.pool.execute(sql, [batchId, n, Ts_ms, JSON.stringify(samples)]);
  }

  async createPendingMPI({ batchId, n, p }) {
    const sql = `
            INSERT INTO benchmark_mpi (batch_id, n, p, status)
            VALUES (?, ?, ?, 'pending')
            ON DUPLICATE KEY UPDATE status = 'pending', error_msg = NULL
        `;

    await this.pool.execute(sql, [batchId, n, p]);
  }

  async markMPIOk({ batchId, n, p, Tp_ms, speedup, efficiency, samples }) {
    const sql = `
            UPDATE benchmark_mpi
            SET Tp_ms=?, speedup=?, efficiency=?, samples_json=CAST(? AS JSON), status='ok', error_msg=NULL
            WHERE batch_id=? AND n=? AND p=?
        `;
    await this.pool.execute(sql, [
      Tp_ms,
      speedup,
      efficiency,
      JSON.stringify(samples),
      batchId,
      n,
      p,
    ]);
  }

  async markMPIFailed({ batchId, n, p, errorMsg }) {
    const sql = `
      UPDATE benchmark_mpi
      SET status='failed', error_msg=?
      WHERE batch_id=? AND n=? AND p=?
    `;
    await this.pool.execute(sql, [
      errorMsg?.slice(0, 2000) || "Errore",
      batchId,
      n,
      p,
    ]);
  }

  async getBatchResults(batchId) {
    // Ritorna metadati + serial + mpi in un unico oggetto
    const [[batch]] = await this.pool.execute(
      `SELECT * FROM benchmark_batches WHERE batch_id=?`,
      [batchId]
    );
    const [serial] = await this.pool.execute(
      `SELECT * FROM benchmark_serial WHERE batch_id=? ORDER BY n`,
      [batchId]
    );
    const [mpi] = await this.pool.execute(
      `SELECT * FROM benchmark_mpi WHERE batch_id=? ORDER BY n, p`,
      [batchId]
    );
    return { batch: batch?.[0] || null, serial, mpi };
  }
}

module.exports = { BenchmarkRepository };

// database/benchmark_repository.mysql.js
class BenchmarkRepository {
  constructor(pool){ this.pool = pool; }

  async createBatch({ batchId, seed, repeats, sizesExpr, procsExpr, sizesList, procsList, oversubscribe, hwProfile }) {
    const sql = `
      INSERT INTO benchmark_batches
      (batch_id, seed, repeats, sizes_expr, procs_expr, sizes_json, procs_json, oversubscribe, hw_profile)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        seed=VALUES(seed), repeats=VALUES(repeats),
        sizes_expr=VALUES(sizes_expr), procs_expr=VALUES(procs_expr),
        sizes_json=VALUES(sizes_json), procs_json=VALUES(procs_json),
        oversubscribe=VALUES(oversubscribe), hw_profile=VALUES(hw_profile)
    `;
    await this.pool.execute(sql, [
      batchId, seed, repeats, sizesExpr, procsExpr,
      JSON.stringify(sizesList), JSON.stringify(procsList),
      oversubscribe ? 1 : 0, hwProfile ? JSON.stringify(hwProfile) : null
    ]);
  }

  async upsertResult({ batchId, n, mode, p, status, timeMs=null, samples=null, errorMsg=null }) {
    const sql = `
      INSERT INTO benchmark_results (batch_id, n, mode, p, status, time_ms, samples_json, error_msg)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        status=VALUES(status),
        time_ms=VALUES(time_ms),
        samples_json=VALUES(samples_json),
        error_msg=VALUES(error_msg)
    `;
    await this.pool.execute(sql, [
      batchId, n, mode, p, status,
      timeMs, samples ? JSON.stringify(samples) : null,
      errorMsg
    ]);
  }

  async getBatchResults(batchId){
    const [batchRows] = await this.pool.execute(`SELECT * FROM benchmark_batches WHERE batch_id=?`, [batchId]);
    const batch = batchRows[0] || null;
    const [rows] = await this.pool.execute(`
      SELECT batch_id, n, p, mode, status, time_ms, samples_json, error_msg, created_at
      FROM benchmark_results
      WHERE batch_id=?
      ORDER BY n ASC, p ASC
    `, [batchId]);
    return { batch, results: rows };
  }
}

module.exports = { BenchmarkRepository };

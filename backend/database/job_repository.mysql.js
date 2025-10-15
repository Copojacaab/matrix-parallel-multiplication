// database/job_repository.mysql.js
const { q } = require('./db_mysql');

// Enumerazione ammessa lato app (validazione input)
const allowedStatus = new Set(['queued','running','completed','failed']);

/**
 * Lista jobs con filtro/ordinamento/paginazione.
 * Nota: le colonne testo grandi (MEDIUMTEXT) si leggono solo se richiesto dall'API con ?include=matrices;
 * qui però manteniamo comportamento identico alla versione SQLite.
 */
async function listJobs({ status, sort='desc', limit=50, offset=0 } = {}) {
  const order = String(sort).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const params = [];
  let where = '';

  if (status) {
    if (!allowedStatus.has(status)) throw new Error('Invalid status');
    where = 'WHERE status = ?';
    params.push(status);
  }

  const sql = `
    SELECT 
      id, status, nra, nca, ncb,
      DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at,
      CASE WHEN completed_at IS NULL THEN NULL
           ELSE DATE_FORMAT(completed_at, '%Y-%m-%dT%H:%i:%sZ')
      END AS completed_at,
      execution_time_ms,
      matrix_a, matrix_b, result_c
    FROM jobs
    ${where}
    ORDER BY created_at ${order}
    LIMIT ? OFFSET ?`;

  params.push(Number(limit) || 50, Number(offset) || 0);

  const [rows] = await q(sql, params);
  return rows.map(r => ({
    id: r.id,
    status: r.status,
    nra: r.nra,
    nca: r.nca,
    ncb: r.ncb,
    created_at: r.created_at,
    completed_at: r.completed_at,
    execution_time_ms: r.execution_time_ms,
    matrix_a: r.matrix_a,
    matrix_b: r.matrix_b,
    result_c: r.result_c,
  }));
}

/** Legge job per id */
async function getJobById(id) {
  const sql = `
    SELECT
      id, status, nra, nca, ncb,
      DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at,
      CASE WHEN completed_at IS NULL THEN NULL
           ELSE DATE_FORMAT(completed_at, '%Y-%m-%dT%H:%i:%sZ')
      END AS completed_at,
      execution_time_ms,
      matrix_a, matrix_b, result_c
    FROM jobs
    WHERE id = ?
  `;
  const [rows] = await q(sql, [id]);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    status: r.status,
    nra: r.nra,
    nca: r.nca,
    ncb: r.ncb,
    created_at: r.created_at,
    completed_at: r.completed_at,
    execution_time_ms: r.execution_time_ms,
    matrix_a: r.matrix_a,
    matrix_b: r.matrix_b,
    result_c: r.result_c,
  };
}

/** Inserisce un nuovo job con stato 'queued' */
async function createJob(id, nra, nca, ncb, matrixA, matrixB) {
  const sql = `
    INSERT INTO jobs (
      id, status, nra, nca, ncb,
      created_at, completed_at, execution_time_ms,
      matrix_a, matrix_b, result_c
    ) VALUES (?, 'queued', ?, ?, ?, CURRENT_TIMESTAMP, NULL, NULL, ?, ?, NULL)
  `;
  const params = [id, nra, nca, ncb, matrixA, matrixB];
  await q(sql, params);
  return id;
}

/** Aggiorna stato → running (idempotente) */
async function updateJobRunning(jobId) {
  const sql = `UPDATE jobs SET status = 'running' WHERE id = ?`;
  await q(sql, [jobId]);
}

/** Aggiorna stato → failed + tempi */
async function updateJobFailure(id, completedAt, executionTimeMs) {
  const sql = `
    UPDATE jobs
    SET status = 'failed',
        completed_at = ?,
        execution_time_ms = ?
    WHERE id = ?
  `;
  await q(sql, [completedAt, executionTimeMs, id]);
}

/** Aggiorna stato → completed + risultato + tempi */
async function updateJobSuccess(id, resultC, completedAt, executionTime) {
  const sql = `
    UPDATE jobs
    SET status = 'completed',
        result_c = ?,
        completed_at = ?,
        execution_time_ms = ?
    WHERE id = ?
  `;
  await q(sql, [resultC, completedAt, executionTime, id]);
}

module.exports = {
  listJobs,
  getJobById, 
  createJob,
  updateJobRunning,
  updateJobFailure,
  updateJobSuccess,
};

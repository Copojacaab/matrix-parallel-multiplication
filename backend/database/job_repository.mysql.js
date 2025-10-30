const { q } = require('./db_mysql');

const allowedStatus = new Set(['queued', 'running', 'completed', 'failed']);

async function countJobs({ status, q: qstr } = {}) {
  const params = [];
  const whereParts = [];

  if (status) {
    if (!allowedStatus.has(status)) throw new Error('invalid status');
    whereParts.push('status = ?');
    params.push(status);
  }

  if (qstr && typeof qstr === 'string' && qstr.trim() !== '') {
    whereParts.push('id LIKE ?');
    params.push(`%${qstr.trim()}%`);
  }

  const where = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';
  const sql = `SELECT COUNT(*) AS cnt FROM jobs ${where}`;
  const [rows] = await q(sql, params);
  return Number(rows[0]?.cnt || 0);
}


async function listJobs({ status, sort = 'desc', limit = 50, offset = 0, q: qstr } = {}) {
  const order = String(sort).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const params = [];
  const whereParts = [];

  if (status) {
    if (!allowedStatus.has(status)) throw new Error('Invalid status');
    whereParts.push('status = ?');
    params.push(status);
  }

  if (qstr && typeof qstr === 'string' && qstr.trim() !== '') {
    whereParts.push('id LIKE ?');
    params.push(`%${qstr.trim()}%`);
  }

  const where = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';

  const sql = `
    SELECT 
      id, status, nra, nca, ncb,
      DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at,
      CASE WHEN completed_at IS NULL THEN NULL
           ELSE DATE_FORMAT(completed_at, '%Y-%m-%dT%H:%i:%sZ')
      END AS completed_at,
      execution_time_ms,
      compute_time_ms,
      exec_total_ms, 
      payload_path, 
      result_path, 
      error_msg
    FROM jobs
    ${where}
    ORDER BY created_at ${order}
    LIMIT ? OFFSET ?
  `;

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
    compute_time_ms: r.compute_time_ms,
    exec_total_ms: r.exec_total_ms,
    payload_path: r.payload_path,
    result_path: r.result_path,
    error_msg: r.error_msg,
  }));
}

/** legge job per id */
async function getJobById(id) {
  const sql = `
    SELECT
      id, status, nra, nca, ncb,
      DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at,
      CASE WHEN completed_at IS NULL THEN NULL
           ELSE DATE_FORMAT(completed_at, '%Y-%m-%dT%H:%i:%sZ')
      END AS completed_at,
      execution_time_ms,
      compute_time_ms,
      exec_total_ms, 
      payload_path, 
      result_path, 
      error_msg
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
    compute_time_ms: r.compute_time_ms,
    exec_total_ms: r.exec_total_ms,
    payload_path: r.payload_path,
    result_path: r.result_path,
    error_msg: r.error_msg,
  };
}

/** inserisce nuovo job stato queued */
async function createJob({ id, nra, nca, ncb, payload_path, result_path }) {
  const sql = `
    INSERT INTO jobs (id, status, nra, nca, ncb, payload_path, result_path)
    VALUES (?, 'queued', ?, ?, ?, ?, ?)
  `;
  const params = [id, nra, nca, ncb, payload_path, result_path];
  await q(sql, params);
  return id;
}

/** aggiorna stato a running */
async function updateJobRunning(jobId) {
  const sql = `UPDATE jobs SET status = 'running' WHERE id = ?`;
  await q(sql, [jobId]);
}

async function updateJobFailure(id, { error_msg = null, exec_total_ms = null } = {}) {
  const sql = `
    UPDATE jobs
    SET status='failed',
        completed_at = CURRENT_TIMESTAMP,
        exec_total_ms = ?,
        error_msg = ?
    WHERE id = ?
  `;
  await q(sql, [exec_total_ms, error_msg, id]);
  return { id };
}

/** aggiorna stato a completed+risultato+tempi */
async function updateJobSuccess(
  id,
  { result_path, compute_time_ms, execution_time_ms, exec_total_ms }
) {
  const sql = `
    UPDATE jobs
    SET status='completed',
        result_path = ?,
        completed_at = CURRENT_TIMESTAMP,
        compute_time_ms = ?,
        execution_time_ms = ?,
        exec_total_ms = ?
    WHERE id = ?
  `;
  await q(sql, [result_path, compute_time_ms, execution_time_ms, exec_total_ms, id]);
}

module.exports = {
  countJobs,
  listJobs,
  getJobById,
  createJob,
  updateJobRunning,
  updateJobFailure,
  updateJobSuccess,
};

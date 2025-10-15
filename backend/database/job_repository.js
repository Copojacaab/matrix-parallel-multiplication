const db = require('./database.js');

/**
 * Restituisce la lista dei jobs con filtro per stato e ordinamento
 * @param {Object} opts
 * @param {'queued' | 'running' | 'completed' | 'failed'}
 * @param {'asc' | 'desc'} ordinamento per created_at
 * @param {number} massimo righe
 * @param {number} offset 
 */

function listJobs({ status, sort='desc', limit=50, offset=0 } = {}) {
  const allowedStatus = new Set(['queued','running','completed','failed']);
  const order = String(sort).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const params = [];
  let where = '';

  if (status) {
    if (!allowedStatus.has(status)) {
      return Promise.reject(new Error('Invalid status'));
    }
    where = 'WHERE status = ?';
    params.push(status);
  }

  const SQL = `
    SELECT 
      id, status, nra, nca, ncb,
      created_at, completed_at, execution_time_ms,
      matrix_a, matrix_b, result_c
    FROM jobs
    ${where}
    ORDER BY created_at ${order}
    LIMIT ? OFFSET ?
  `;

  params.push(Number(limit) || 50, Number(offset) || 0);

  return new Promise((resolve, reject) => {
    db.all(SQL, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows.map(r => ({
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
      })));
    });
  });
}


// legge job per id
function getJobById(id){
    const SQL = `
        SELECT
            id, status, nra, nca, ncb,
            created_at, completed_at, execution_time_ms,
            matrix_a, matrix_b, result_c
        FROM jobs
        WHERE id = ?
    `;

    return new Promise((resolve, reject) => {
        db.get(SQL, [id], (err, row) => {
            if (err) return reject(err);
            if (!row) return resolve(null);

            resolve({
                id: row.id,
                status: row.status,
                nra: row.nra,
                nca: row.nca,
                ncb: row.ncb,
                created_at: row.created_at,
                completed_at: row.completed_at,
                execution_time_ms: row.execution_time_ms,
                matrix_a: row.matrix_a,
                matrix_b: row.matrix_b,
                result_c: row.result_c,
            });
        });
    }); // <-- MANCAVA QUESTA
}


const insert_jobs_SQL = `
    INSERT INTO jobs (
        id, status, nra, nca, ncb,
        created_at, completed_at, execution_time_ms,
        matrix_a, matrix_b, result_c
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

// inserire nuova riga
function createJob(id, nra, nca, ncb, matrixA, matrixB){
    const params = [
        id, 
        'queued', 
        nra, nca, ncb, 
        new Date().toISOString(),
        null, 
        null, 
        matrixA, // Dati di test per le matrici (come stringa JSON)
        matrixB, 
        null,
    ];
    return new Promise((resolve, reject) => {
        // La sintassi della Promise e db.run qui era CORRETTA.
        db.run(insert_jobs_SQL, params, function(err) { // Usa 'function' per accedere a this.lastID se necessario
            if(err){
                reject(err);
            }else {
                // Inserimento completato, risolvi con l'ID
                resolve(id); 
            }
        }); // Chiusura corretta di db.run
    }); // Chiusura corretta di new Promise
}


// aggiornare una riga running
function updateJobRunning(jobId){
    const update_jobRunning_SQL = `
        UPDATE jobs
        SET status = "running"
        WHERE id = ?
    `;

    return new Promise((resolve, reject) => {
        db.run(update_jobRunning_SQL, [jobId], (err) => err ? reject(err) : resolve());
    });
}

// aggiorna il record con failure
function updateJobFailure(id, completedAt, executionTimeMs){
    const update_jobFailure_SQL = `
        UPDATE jobs
        SET
            status = "failed",
            completed_at = $completedAt,
            execution_time_ms = $executionTimeMs
        WHERE id = $id
    `;
    const params = {
        $completedAt: completedAt,
        $executionTimeMs:  executionTimeMs,
        $id: id
    };

    return new Promise((resolve, reject) => {
        db.run(update_jobFailure_SQL, params, (err) => err ? reject(err) : resolve());
    });
}

// aggiornare una riga success
function updateJobSuccess (id, resultC, completedAt, executionTime){
    const update_jobSuccess_SQL = `
        UPDATE jobs 
        SET
            result_c = $resultC,
            completed_at = $completedAt,
            execution_time_ms = $executionTime,
            status = $status
        WHERE id = $id
    `;
    // 💡 NOTA: ho aggiunto $status qui, altrimenti la query SQL non funziona correttamente.
    const params = {
        $resultC: resultC,
        $completedAt: completedAt,
        $executionTime: executionTime,
        $status: 'completed', // Aggiunto il campo mancante
        $id: id
    };

    return new Promise((resolve, reject) => {
        // ❌ ERRORE QUI: La callback era fuori dalla chiamata db.run
        db.run(update_jobSuccess_SQL, params, function(err) { // <-- L'errore era la chiusura anticipata di db.run
            if(err){
                reject(err);
            }else{
                // Aggiornamento completato, risolvi con l'ID
                resolve(id);
            }
        }); // <-- Chiusura corretta di db.run
    }); // <-- Chiusura corretta di new Promise
}

module.exports = {
    listJobs,
    getJobById, 
    createJob,
    updateJobRunning,
    updateJobFailure,
    updateJobSuccess,
};
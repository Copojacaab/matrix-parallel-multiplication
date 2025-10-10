const db = require('./database.js');

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
        'pending', 
        nra, nca, ncb, 
        new Date().toISOString(),
        null, 
        null, 
        matrixA, // Dati di test per le matrici (come stringa JSON)
        matrixB, 
        null,
    ];
    return new Promise((resolve, reject) => {
        db.run(insert_jobs_SQL, params, (err) => {
            if(err){
                reject(err);
            }else {
                resolve(id);
            }
    });
    })



}

// aggiornare una riga
function updateJobSuccess (id, resultC, completedAt, executionTIme){

}

module.exports = {
    createJob,
};
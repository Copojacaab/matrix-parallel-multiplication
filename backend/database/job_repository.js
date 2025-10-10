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

// --------------------------------------------------------------------------------------------------

const update_job_SQL = `
    UPDATE jobs 
    SET
        result_c = $resultC,
        completed_at = $completedAt,
        execution_time_ms = $executionTime,
        status = $status
    WHERE id = $id
`;

// aggiornare una riga
function updateJobSuccess (id, resultC, completedAt, executionTime){
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
        db.run(update_job_SQL, params, function(err) { // <-- L'errore era la chiusura anticipata di db.run
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
    createJob,
    updateJobSuccess,
};
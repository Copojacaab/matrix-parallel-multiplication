// importo il db da database.js
const db = require('./database.js');
const { createJob } = require('./job_repository.js');

console.log('---------- INIZIO TEST DB ----------');

// 1. Test di inserimento all'interno di jobs
const insert_jobs_SQL = `
    INSERT INTO jobs (
        id, status, nra, nca, ncb,
        created_at, completed_at, execution_time_ms,
        matrix_a, matrix_b, result_c
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

// 2. sql per test di lettura su jobs
const select_jobs_SQL = `SELECT * FROM jobs WHERE id = ?`;

db.serialize(() => {
    // 1. test di inserimento all'interno di jobs
    createJob('test-id-123', 2, 2, 2, '[[1,2],[3,4]]', '[[5,6],[7,8]]')
    .then(jobId => {
        console.log(`Test OK: Job inserito con ID: ${jobId}`);
        // Qui dentro puoi mettere la logica di verifica con db.get()
    })
    .catch(err => {
        console.error('Test FALLITO:', err);
    });
    // 2. test di selezione
    db.get(select_jobs_SQL, ['test-id-123'], (err, row) => {
        if(err){
            console.error('errore nel secondo test' + err);
        }
        if(row){
            console.log('Secondo test OK');
            console.log(row);
        }else{
            console.error('errore nel secondo test(riga non trovata)');
        }

        db.close((err) => {
            if(err) {
                return console.error(err.message);
            }
            console.log('CONNESSIONE AL DB chiusa');
        });
    });
        

});


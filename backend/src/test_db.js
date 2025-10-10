// importo il db da database.js
const db = require('./database.js');


console.log('---------- INIZIO TEST DB ----------');

// 1. Test di inserimento all'interno di jobs
const insert_jobs_SQL = `
    INSERT INTO jobs (
        id, status, nra, nca, ncb,
        created_at, completed_at, execution_time_ms,
        matrix_a, matrix_b, result_c
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const params = [
    'test-id-123', 
    'completed', 
    10, 10, 10, 
    new Date().toISOString(), // Data di creazione
    null, 
    null, 
    '[[1,2],[3,4]]', // Dati di test per le matrici (come stringa JSON)
    '[[5,6],[7,8]]', 
    '[[19,22],[43,50]]'
];

// 2. sql per test di lettura su jobs
const select_jobs_SQL = `SELECT * FROM jobs WHERE id = ?`;

db.serialize(() => {
    // 1. test di inserimento all'interno di jobs
    db.run(insert_jobs_SQL, params, (err) => {
        if(err){
            console.error('errore nel primo test'  + err);
        } else{
            console.log('Primo test ok');
        }
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
        // CHIUDE LA CONNESSIONE AL DB
        db.close((err) => {
            if(err) {
                return console.error(err.message);
            }
            console.log('CONNESSIONE AL DB chiusa');
        });
    });
        

});


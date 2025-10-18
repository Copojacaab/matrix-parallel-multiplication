// importo il db da database.js
const db = require('./database.js');
const { createJob, updateJobSuccess } = require('./job_repository.js');

console.log('---------- INIZIO TEST DB ----------');

// --- DATI DI ESEMPIO ---
const testId = `test-${Date.now()}`; // Un ID unico per ogni test
const createData = {
    nra: 2, nca: 2, ncb: 2,
    matrixA: '[[1,1],[1,1]]',
    matrixB: '[[2,2],[2,2]]'
};
const updateData = {
    resultC: '[[4,4],[4,4]]',
    executionTime: 123, // ms
    completedAt: new Date().toISOString()
};

// --- LOGICA DEL TEST ---
console.log(`Avvio test per il job: ${testId}`);

// 1. CREA
createJob(testId, createData.nra, createData.nca, createData.ncb, createData.matrixA, createData.matrixB)
  .then(createdId => {
    console.log(`PASSO 1 OK: Creato job con ID ${createdId}`);
    
    // 2. AGGIORNA
    return updateJobSuccess(createdId, updateData.resultC, updateData.completedAt, updateData.executionTime);
  })
  .then(updatedId => {
    console.log(`PASSO 2 OK: Aggiornato job con ID ${updatedId}`);
    
    // 3. VERIFICA (da implementare)
    const sql = 'SELECT * FROM jobs WHERE id = ?';

    db.get(sql, [updatedId], (err, row) => {
        if (err) {
            return console.error('VERIFICA FALLITA (errore db)');
        }else {
            if (row.status === 'completed' && row.result_c === updateData.resultC){
                console.log('PASSO 3: Verifica completata con successo');
            }else {
                console.error('VERIFICA FALLITA: risultato non uguale');
            }
        }
    })
  })
  .catch(err => {
    console.error("TEST FALLITO:", err);
  });


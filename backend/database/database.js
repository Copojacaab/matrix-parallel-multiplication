// database.js - Versione Corretta
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
// leggi il percorso da env, se non c'é uso jobs (cross-env in package)
const DB_SOURCE = process.env.SQLITE_DB_PATH || path.join(__dirname, 'jobs.db');

// 1. Apri la connessione. Il callback gestisce solo l'errore iniziale.
const db = new sqlite3.Database(DB_SOURCE, (err) => {
    if (err) {
        console.error(err.message);
        throw err;
    }
});

console.log('Connesso al database SQLite.', DB_SOURCE);

// 2. Esegui la creazione delle tabelle in modo seriale, subito dopo.
//    La libreria mette in coda questi comandi e li esegue non appena il DB è pronto.
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            status TEXT,
            nra INTEGER,
            nca INTEGER,
            ncb INTEGER,
            created_at DATETIME,
            completed_at DATETIME,
            execution_time_ms INTEGER,
            matrix_a TEXT,
            matrix_b TEXT,
            result_c TEXT
        )
    `, (err) => {
        if (err) {
            console.error("Errore creazione tabella jobs:", err.message);
        } else {
            console.log("Tabella 'jobs' pronta.");
        }
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS benchmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            matrix_size INTEGER,
            process_count INTEGER,
            execution_time_ms INTEGER,
            speedup REAL
        )
    `, (err) => {
        if (err) {
            console.error("Errore creazione tabella benchmarks:", err.message);
        } else {
            console.log("Tabella 'benchmarks' pronta.");
        }
    });
});

// 3. Esporta l'oggetto db. A questo punto, i comandi sono già in coda e verranno eseguiti.
module.exports = db;
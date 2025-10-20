// gestione della connessione sql con pool (/promise)
const mysql = require('mysql2/promise');

// creo pool di connessioni
const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASS,
    database: process.env.MYSQL_DB,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// sanity check all'avvio
(async () => {
    try{
        const [ rows ] = await pool.query('SELECT 1 as OK');
        if(rows && rows[0] && rows[0].OK === 1){
            console.log('[DB] MySQL pool connesso');
        }
    }catch (err){
        console.log('[DB] errore nella connessione con MySQL pool ', err);
    }
})();

/**  helper per query parametrizzante
 * @param {string} sql - query con placeholder
 * @param {Array} params - valori
 * @return {Promise <[row, fields]>}
*/
function q(sql, params = []){
    return pool.query(sql, params);
}

module.exports = { pool, q };
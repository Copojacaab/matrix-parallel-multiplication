// Scopo: eseguire un comando (seriale o mpirun) misurando i tempi

const { execFile } = require('child_process');

/**
 * @param { file } => string: programma da esegire
 * @param { args } => Arr[string]: argomenti da pasare al comando
 * @param { cwd } => string: dir di lavoro
 */
function runCommandTimed(file, args = [], { cwd = process.cwd() } = {}){
    return new Promise((resolve, reject) => {
        const t0 = process.hrtime.bigint();
        const child = execFile(file, args, { cwd }, (error, stdout, stderr) => {
            const t1 = process.hrtime.bigint();
            const execTimeMs = Number(t1-t0) / 1e6; // passo a milli (young money)
            if(error){
                error.execTimeMs = execTimeMs;
                error.stdout = stdout?.toString?.() || '';
                error.stderr = stderr?.toString?.() || '';
                return reject(error);
            }
            resolve({ execTimeMs, stdout: stdout?.toString?.() || '', stderr: stderr?.toString?.() || '' });
        }); 
    });
}

module.exports = { runCommandTimed };
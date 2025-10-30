const fs = require('fs');
const path = require('path');
const { workerData } = require('worker_threads');

/**
 *  MATRIXGEN PER BENCH
 */

// linear congruential generator
function makeLCG(seed){
    // 32 bit
    let state = BigInt(seed >>> 0);
    const A = 1664525n, C = 1013904223n, M = 4294967296n;

    return function() {
        state = (A * state + C) % M
        return Number(state)/Number(M); //normalizzato [0,1]
    };
}

function writeMatrix(filePath, n, rand){
    const lines = [];
    lines.push(`${n} ${n}`);

    for(let i = 0; i < n; i++){
        const row = [];
        for(let j = 0; j < n; j++){
            row.push(rand().toFixed(6)); //inserisco cella
        }
        lines.push(row.join(' ')); // inserisco riga
    }
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

function generateAB( seed, n, outDir) {
    if(!fs.existsSync(outDir))
        fs.mkdirSync(outDir, { recursive: true });
    // costante di knuth --> mischia seed con n (non lineare)
    const randA = makeLCG(seed ^ (n * 2654435761));
    const randB = makeLCG((seed + n) ^ 0x9e3779b9);

    const pathA = path.join(outDir, `A_${n}.txt`);
    const pathB = path.join(outDir, `B_${n}.txt`);

    writeMatrix(pathA, n, randA);
    writeMatrix(pathB, n, randB);

    return { pathA, pathB };
}

/**
 * CALCOLO MEDIANA PER BENCH
 */

function medianAfterWarmup(timesMs){
    if(!Array.isArray(timesMs) || timesMs.length === 0)
        throw new Error('Nessun campione fornito');
    // scarto warmup
    const withoutWarmup = timesMs.slice(1);
    if(withoutWarmup.length === 0)
        return timesMs[0]; //se abbiamo solo un campione per forza hai da fa

    const arr = withoutWarmup.slice().sort((a,b) => a-b);
    const mid = Math.floor(arr.length/2);
    
    if(arr.length % 2 === 0)
        return (arr[mid-1] + arr[mid]) / 2;

    return arr[mid];
}


module.exports = { generateAB, medianAfterWarmup };
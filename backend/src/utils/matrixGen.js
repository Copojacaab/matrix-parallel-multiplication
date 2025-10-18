// Scopo: generare A,B di dim nxn deterministiche (seed) e salvare su file.txt
// Formato: prima riga "rows cols", da seconda riga in poi matrici (el separati da spazio)

const fs = require('fs');
const path = require('path');
const { workerData } = require('worker_threads');

// linear congruential generator
function makeLCG(seed){
    // 32 bit
    let state = BigInt(seed >>> 0);
    const A = 1664525n, C = 1013904223n, M = 4294967296n;

    return function() {
        state = (A * state + C) % M
        return Number(state)/Number(M); //normalizzato (0,1)
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
    // costante di Knuth, mischia seed con n (non lineare)
    const randA = makeLCG(seed ^ (n * 2654435761));
    const randB = makeLCG((seed + n) ^ 0x9e3779b9);

    const pathA = path.join(outDir, `A_${n}.txt`);
    const pathB = path.join(outDir, `B_${n}.txt`);

    writeMatrix(pathA, n, randA);
    writeMatrix(pathB, n, randB);

    return { pathA, pathB };
}

module.exports = { generateAB };

if(require.main === module){
    // makeLCG
    const rand = makeLCG(1234);
    console.log(rand());
    console.log(rand());

  // Generazione matrici A e B
  console.log("\nGenerazione matrici A e B...");
  const outDir = './output_matrixGen';
  const { pathA, pathB } = generateAB(1234, 3, outDir);

  // Lettura e stampa dei file generati
  const dataA = fs.readFileSync(pathA, 'utf8');
  const dataB = fs.readFileSync(pathB, 'utf8');

  console.log('\n📄 Contenuto di A:');
  console.log(dataA);

  console.log('\n📄 Contenuto di B:');
  console.log(dataB);
}
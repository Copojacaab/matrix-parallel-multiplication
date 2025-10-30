function parseListOrRange (expr, { min = 1, 
    max = Number.MAX_SAFE_INTEGER,stepDefault = 1,} = {}){

        if(typeof(expr) !== 'string' || expr.trim() === '')
            throw new Error('Fornisci una lista (es. "128, 256") o un range(es. "128-1024:128")');
        // normal dei separatori
        const str = expr.replace(/\s+/g, '');

        // CASO 1: lista a,b,c
        if(str.includes(',') && !str.includes('-')){
            const parts = str.split(',');
            const out = [];
            const seen = new Set();
            // scorro le parti della "strlista"
            for (const p of parts){
                if(!/^-?\d+(\.\d+)?$/.test(p))
                    throw new Error(`Valore non numerico nella lista: "${p}"`);
                const v = Number(p);
                if(!Number.isFinite(v))
                    throw new Error(`Valore non finito: "${p}"`);
                if(v < min || v > max)
                    throw new Error(`Valore fuori range: "${v}" (min=${min}, max = ${max})`);
                // check valori ripetuti
                if(!seen.has(v)){
                    seen.add(v);
                    out.push(v);
                }
            }
            out.sort((a,b) => a-b);
            return out;
        }

        // CASO 2: range start-end(:step?)
        const m = str.match(/^(-?\d+(?:\.\d+)?)\-(-?\d+(?:\.\d+)?)(?::(-?\d+(?:\.\d+)?))?$/
);
        if(!m)
            throw new Error(`Formato non riconosciuto: "${expr}". Usa a,b,c oppure start-end:step`);
        let start = Number(m[1]);
        let end = Number(m[2]);
        let step = Number(m[3] ?? stepDefault);

        if(step === 0)
            throw new Error('Lo step non puó essere 0');
        // consento range decrescenti
        if(start > end && step > 0)
            step = -step;

        const out = [];
        const seen = new Set();
        for(let v = start; (step > 0 ? v <= end : v >= end); v += step){
            if(!seen.has(v)){
                seen.add(v);
                out.push(v);
            }
        }
        if(out.length === 0)
            throw new Error(`Range vuoto: controlla start, end e step.`);

        out.sort((a,b) => a-b);
        return out;
}

if(require.main === module){
    console.log("Lista: ")
    for(const el of parseListOrRange("128, 256"))
        console.log(el);

    console.log("Range con step")
    for(const el of parseListOrRange("128-256: 64"))
        console.log(el);

    console.log("Range senza step")
    for(const el of parseListOrRange("1-5")){
        console.log(el);
    }
}

// Scopo: limite massimo alle combinazioni nxp per batch

function validateCombinationLimit (sizes, procs, limit = 100){
    const combination = sizes.length * procs.length;
    if(combination > limit)
        throw new Error(`Troppe combinazioni: ${combination} (limite massimo ${limit})`);
    return combination;
}

module.exports = { parseListOrRange, validateCombinationLimit };

if (require.main === module){
    console.log(validateCombinationLimit([128,256], [2,3,4]));
}
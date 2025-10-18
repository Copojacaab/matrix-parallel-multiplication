// Scopo: calcolare la mediana dei tempi dopo aver scartato il primo

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


module.exports = { medianAfterWarmup };

// nel debug ricordati che scarti la prima per il warmup (104 moment)
if(require.main === module){
    console.log(medianAfterWarmup([1,2,3,4,5]));
}
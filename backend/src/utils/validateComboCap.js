// Scopo: limite massimo alle combinazioni nxp per batch

function validateCombinationLimit (sizes, procs, limit = 100){
    const combination = sizes.length * procs.length;
    if(combination > limit)
        throw new Error(`Troppe combinazioni: ${combination} (limite massimo ${limit})`);
    return combination;
}

module.exports = { validateCombinationLimit };

if (require.main === module){
    console.log(validateCombinationLimit([128,256], [2,3,4]));
}
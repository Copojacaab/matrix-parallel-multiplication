// validazione singola matrice
function isValidMatrix(matrix){
  // se non é una matrice o é vuoto
  if(!Array.isArray(matrix) || matrix.length === 0)
    return false;
  // controllo se ci sono colonne
  const cols = Array.isArray(matrix[0]) ? matrix[0].length : -1;
  if(cols <= 0)
    return false;
  // controllo le righe
  for(const rows of matrix){
    if(!Array.isArray(rows) || rows.length !== cols)
      return false; //righe irregolari
    // check agli elementi
    for(const data of rows){
      if(typeof(data) !== 'number' || !Number.isFinite(data))
          return false;
    }
  }
  // matrice valida
  return true;
}

function validateMatrixPair(A,B) {
    if(!isValidMatrix){
        return 'matrixA e matrixB devono essere array bidimensionali con numeri finiti';
    }
    // check moltiplicazione
    const rowsA = A.length, colsA = A[0].length;
    const rowsB = B.length, colsB = B[0].length;

    if(colsA !== rowsB){
        return `Dimensioni non compatibili: A ${rowsA} x ${colsA}, B ${rowsB} x ${colsB}`;
    }
    return null; //ok
}

module.exports = { isValidMatrix, validateMatrixPair };
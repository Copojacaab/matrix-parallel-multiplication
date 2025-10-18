/**
 * new.js — pagina "Nuovo calcolo"
 * Estensione: input dinamico tramite griglie per A (m×n) e B (n×p),
 * mantenendo le textarea come metodo alternativo/test.
 *
 * Flusso:
 * 1) L'utente imposta m, n, p → "Genera griglie".
 * 2) Compila le celle → "Avvia calcolo" (preferiamo le griglie se presenti e valide).
 * 3) Validazione (rettangolarità, numeri, compatibilità A m×n · B n×p).
 * 4) POST al backend con { matrixA, matrixB } → redirect a status.html?jobId=...
 */

const BASE_URL = 'http://localhost:3000';

// ------------------------
// Selettori base
// ------------------------
const $ = (s) => document.querySelector(s);

// Textarea (metodo alternativo/test)
const tA       = $('#matA');
const tB       = $('#matB');
const shapeA   = $('#shapeA');
const shapeB   = $('#shapeB');
const errA     = $('#errA');
const errB     = $('#errB');

// Invio
const btnStart = $('#btnStart');
const feedback = $('#feedback');
const summary  = $('#summary');

// Dinamico (griglie)
const dimM = $('#dim-m');
const dimN = $('#dim-n');
const dimP = $('#dim-p');
const btnBuildGrids = $('#btnBuildGrids');
const gridA = $('#gridA');
const gridB = $('#gridB');
const gridErrA = $('#gridErrA');
const gridErrB = $('#gridErrB');
const gridSummary = $('#gridSummary');

// Utility di copia tra modalità
const btnGridAToTextarea = $('#gridAToTextarea');
const btnGridBToTextarea = $('#gridBToTextarea');
const btnTextareaFromGrids = $('#textareaFromGrids');
const btnGridsFromTextarea = $('#gridsFromTextarea');

// Pulsanti riempimento rapido
const gridAFillZeros = $('#gridAFillZeros');
const gridAFillOnes  = $('#gridAFillOnes');
const gridBFillZeros = $('#gridBFillZeros');
const gridBFillOnes  = $('#gridBFillOnes');

// Generazione casuale (già preesistente)
const gM   = $('#gen-m');
const gN   = $('#gen-n');
const gP   = $('#gen-p');
const gMin = $('#gen-min');
const gMax = $('#gen-max');
const btnRandom = $('#btnRandom');

// ------------------------
// Parsing e validazioni (riuso + utilità nuove)
// ------------------------

/**
 * Converte testo -> Array<Array<number>>
 * Accetta spazi, tab, virgole. Ignora righe vuote iniziali/finali.
 * Lancia Error con messaggio "umano" se trova problemi.
 */
function parseMatrix(text) {
  const rows = text
    .trim()
    .split(/\n+/)
    .map(r => r.trim())
    .filter(r => r.length > 0)
    .map(r => r.split(/[\s,]+/).map(v => Number(v)));

  if (rows.length === 0) throw new Error('La matrice è vuota');

  const nCols = rows[0].length;
  if (nCols === 0) throw new Error('Prima riga senza valori');

  for (let i = 0; i < rows.length; i++) {
    if (rows[i].length !== nCols) {
      throw new Error(`Riga ${i + 1}: valori ${rows[i].length} ≠ ${nCols}`);
    }
    for (let j = 0; j < nCols; j++) {
      if (!Number.isFinite(rows[i][j])) {
        throw new Error(`Valore non numerico in riga ${i + 1}, colonna ${j + 1}`);
      }
    }
  }
  return rows;
}

const fmtShape = (M) => (Array.isArray(M) ? `${M.length} × ${M[0]?.length ?? 0}` : '—');
const setError = (el, msg) => { el.textContent = msg; el.hidden = !msg; };

// ------------------------
// Griglie dinamiche
// ------------------------

/**
 * Crea una griglia m×n di input numerici dentro container.
 * namePrefix: 'a' o 'b' per distinguere gli id (es. a-r1-c1).
 */
function buildGrid(container, m, n, namePrefix) {
  container.innerHTML = '';
  container.style.gridTemplateRows = `repeat(${m}, auto)`;

  for (let i = 0; i < m; i++) {
    const row = document.createElement('div');
    row.className = 'matrix-row';
    row.style.gridTemplateColumns = `repeat(${n}, minmax(50px, 1fr))`;

    for (let j = 0; j < n; j++) {
      const cell = document.createElement('div');
      cell.className = 'matrix-cell';

      const input = document.createElement('input');
      input.type = 'number';
      input.inputMode = 'decimal';
      input.id = `${namePrefix}-r${i+1}-c${j+1}`;
      input.placeholder = '0';

      cell.appendChild(input);
      row.appendChild(cell);
    }
    container.appendChild(row);
  }
}

/** Ritorna Array<Array<number>> leggendo tutti gli <input> in una griglia. */
function readGrid(container, m, n) {
  const M = new Array(m);
  for (let i = 0; i < m; i++) {
    const row = new Array(n);
    for (let j = 0; j < n; j++) {
      const inp = container.querySelector(`#${container === gridA ? 'a' : 'b'}-r${i+1}-c${j+1}`);
      const val = inp && inp.value !== '' ? Number(inp.value) : 0;
      if (!Number.isFinite(val)) {
        throw new Error(`Valore non numerico in riga ${i+1}, colonna ${j+1}`);
      }
      row[j] = val;
    }
    M[i] = row;
  }
  return M;
}

/** Scrive una matrice M in una griglia già costruita. */
function writeGrid(container, M, namePrefix) {
  const m = M.length;
  const n = M[0]?.length ?? 0;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      const inp = container.querySelector(`#${namePrefix}-r${i+1}-c${j+1}`);
      if (inp) inp.value = String(M[i][j]);
    }
  }
}

/** Converte matrice in testo (righe newline, valori separati da spazio). */
function matrixToTextarea(M) {
  return M.map(row => row.join(' ')).join('\n');
}

/** Prova a leggere le dimensioni attuali delle griglie dal DOM (se esistono). */
function currentGridDims() {
  const aRows = gridA.querySelectorAll('.matrix-row').length;
  const aCols = aRows ? gridA.querySelector('.matrix-row').children.length : 0;
  const bRows = gridB.querySelectorAll('.matrix-row').length;
  const bCols = bRows ? gridB.querySelector('.matrix-row').children.length : 0;
  return { aRows, aCols, bRows, bCols };
}

/** Msg compatibilità sintetico (preferisce griglie, sennò textarea). */
function compatSummary() {
  // Prova griglie
  const { aRows, aCols, bRows, bCols } = currentGridDims();
  if (aRows && aCols && bRows && bCols) {
    if (aCols !== bRows) return `Compatibilità: ❌ (A ${aRows}×${aCols}, B ${bRows}×${bCols} → ${aCols} ≠ ${bRows})`;
    return `Compatibilità: ✅ (A ${aRows}×${aCols} · B ${bRows}×${bCols} → risultato ${aRows}×${bCols})`;
  }
  // Fallback: textarea
  try {
    const A = parseMatrix(tA.value);
    const B = parseMatrix(tB.value);
    const m = A.length, n = A[0].length;
    const n2 = B.length, p = B[0].length;
    if (n !== n2) return `Compatibilità: ❌ (A ${m}×${n}, B ${n2}×${p} → ${n} ≠ ${n2})`;
    return `Compatibilità: ✅ (A ${m}×${n} · B ${n2}×${p} → risultato ${m}×${p})`;
  } catch {
    return 'Compatibilità: —';
  }
}

// ------------------------
// Bind: costruzione griglie
// ------------------------
btnBuildGrids?.addEventListener('click', () => {
  setError(gridErrA, ''); setError(gridErrB, '');

  const m = Number(dimM.value);
  const n = Number(dimN.value);
  const p = Number(dimP.value);

  if (!(m > 0 && n > 0 && p > 0)) {
    gridSummary.textContent = 'Imposta dimensioni valide (m, n, p > 0).';
    return;
  }

  buildGrid(gridA, m, n, 'a');
  buildGrid(gridB, n, p, 'b');
  gridSummary.textContent = `Griglie create: A ${m}×${n}, B ${n}×${p}.`;

  summary.textContent = compatSummary();
});

// Riempimenti rapidi
gridAFillZeros?.addEventListener('click', () => {
  const { aRows, aCols } = currentGridDims();
  if (!aRows || !aCols) return;
  const A = Array.from({ length: aRows }, () => Array(aCols).fill(0));
  writeGrid(gridA, A, 'a'); summary.textContent = compatSummary();
});
gridAFillOnes?.addEventListener('click', () => {
  const { aRows, aCols } = currentGridDims();
  if (!aRows || !aCols) return;
  const A = Array.from({ length: aRows }, () => Array(aCols).fill(1));
  writeGrid(gridA, A, 'a'); summary.textContent = compatSummary();
});
gridBFillZeros?.addEventListener('click', () => {
  const { bRows, bCols } = currentGridDims();
  if (!bRows || !bCols) return;
  const B = Array.from({ length: bRows }, () => Array(bCols).fill(0));
  writeGrid(gridB, B, 'b'); summary.textContent = compatSummary();
});
gridBFillOnes?.addEventListener('click', () => {
  const { bRows, bCols } = currentGridDims();
  if (!bRows || !bCols) return;
  const B = Array.from({ length: bRows }, () => Array(bCols).fill(1));
  writeGrid(gridB, B, 'b'); summary.textContent = compatSummary();
});

// Copie: griglie → textarea (singole)
btnGridAToTextarea?.addEventListener('click', () => {
  try {
    const { aRows, aCols } = currentGridDims();
    if (!aRows || !aCols) throw new Error('Griglia A non generata');
    const A = readGrid(gridA, aRows, aCols);
    tA.value = matrixToTextarea(A);
    setError(errA, ''); tA.classList.remove('error');
    summary.textContent = compatSummary();
  } catch (e) { setError(gridErrA, e.message); }
});
btnGridBToTextarea?.addEventListener('click', () => {
  try {
    const { bRows, bCols } = currentGridDims();
    if (!bRows || !bCols) throw new Error('Griglia B non generata');
    const B = readGrid(gridB, bRows, bCols);
    tB.value = matrixToTextarea(B);
    setError(errB, ''); tB.classList.remove('error');
    summary.textContent = compatSummary();
  } catch (e) { setError(gridErrB, e.message); }
});

// Copie combinate
btnTextareaFromGrids?.addEventListener('click', () => {
  try {
    const { aRows, aCols, bRows, bCols } = currentGridDims();
    if (!(aRows && aCols && bRows && bCols)) throw new Error('Griglie non generate');
    tA.value = matrixToTextarea(readGrid(gridA, aRows, aCols));
    tB.value = matrixToTextarea(readGrid(gridB, bRows, bCols));
    setError(errA, ''); setError(errB, '');
    tA.classList.remove('error'); tB.classList.remove('error');
    summary.textContent = compatSummary();
  } catch (e) {
    feedback.textContent = e.message; feedback.className = 'msg err';
  }
});

btnGridsFromTextarea?.addEventListener('click', () => {
  try {
    const A = parseMatrix(tA.value);
    const B = parseMatrix(tB.value);
    const m = A.length, n = A[0].length, n2 = B.length, p = B[0].length;
    // (ri)costruisci griglie coerenti con le textarea
    buildGrid(gridA, m, n, 'a'); writeGrid(gridA, A, 'a');
    buildGrid(gridB, n2, p, 'b'); writeGrid(gridB, B, 'b');
    dimM.value = m; dimN.value = n; dimP.value = p;
    gridSummary.textContent = `Griglie create dalle textarea: A ${m}×${n}, B ${n2}×${p}.`;
    summary.textContent = compatSummary();
  } catch (e) {
    feedback.textContent = e.message; feedback.className = 'msg err';
  }
});

// ------------------------
// Aggiornamento live per le textarea (come prima)
// ------------------------
function liveUpdate() {
  try {
    const A = parseMatrix(tA.value);
    shapeA.textContent = fmtShape(A);
    setError(errA, ''); tA.classList.remove('error');
  } catch (e) {
    shapeA.textContent = '—';
    setError(errA, e.message); tA.classList.add('error');
  }

  try {
    const B = parseMatrix(tB.value);
    shapeB.textContent = fmtShape(B);
    setError(errB, ''); tB.classList.remove('error');
  } catch (e) {
    shapeB.textContent = '—';
    setError(errB, e.message); tB.classList.add('error');
  }

  summary.textContent = compatSummary();
}
tA.addEventListener('input', liveUpdate);
tB.addEventListener('input', liveUpdate);
liveUpdate();

// ------------------------
// Invio al backend (preferisce griglie, fallback textarea)
// ------------------------
btnStart.addEventListener('click', async () => {
  feedback.textContent = ''; feedback.className = 'msg';

  // 1) Prova a usare le griglie se esistono
  const { aRows, aCols, bRows, bCols } = currentGridDims();
  let A, B;

  try {
    if (aRows && aCols && bRows && bCols) {
      A = readGrid(gridA, aRows, aCols);
      B = readGrid(gridB, bRows, bCols);
    } else {
      // Fallback: parse dalle textarea (comportamento originale)
      A = parseMatrix(tA.value);
      B = parseMatrix(tB.value);
    }
  } catch (e) {
    feedback.textContent = e.message;
    feedback.className = 'msg err';
    return;
  }

  // 2) Compatibilità dimensioni per A(m×n) · B(n×p)
  const n = A[0].length, n2 = B.length;
  if (n !== n2) {
    feedback.textContent = 'Le dimensioni non sono compatibili (colonne di A ≠ righe di B).';
    feedback.className = 'msg err';
    return;
  }

  // 3) Payload conforme al backend
  const payload = { matrixA: A, matrixB: B };

  // 4) POST al backend + redirect (come prima)
  btnStart.disabled = true; btnStart.textContent = '⏳ Invio...';
  try {
    const res = await fetch(`${BASE_URL}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.status !== 202) {
      const text = await res.text();
      throw new Error(`Il server ha risposto ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = await res.json();
    const jobId = data.jobId || data.id || data.jobID;
    if (!jobId) throw new Error('jobId mancante nella risposta del server');

    feedback.textContent = 'Job creato, reindirizzamento...';
    feedback.className = 'msg ok';

    const url = new URL('status.html', window.location.href);
    url.searchParams.set('jobId', jobId);
    window.location.href = url.toString();

  } catch (err) {
    console.error(err);
    feedback.textContent = err.message || 'Errore durante l’invio';
    feedback.className = 'msg err';
  } finally {
    btnStart.disabled = false; btnStart.textContent = '▶ Avvia calcolo';
  }
});

// ------------------------
// Generazione casuale (riuso della tua logica)
// ------------------------
function randInt(min, max) {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}
function randomMatrix(m, n, min, max) {
  const M = new Array(m);
  for (let i = 0; i < m; i++) {
    const row = new Array(n);
    for (let j = 0; j < n; j++) row[j] = randInt(min, max);
    M[i] = row;
  }
  return M;
}
btnRandom?.addEventListener('click', (e) => {
  e.preventDefault();

  let m = Number(gM?.value || 0);
  let n = Number(gN?.value || 0);
  let p = Number(gP?.value || 0);

  if (!(m > 0 && n > 0 && p > 0)) {
    feedback.textContent = 'Imposta dimensioni valide (m, n, p > 0) o compila almeno una volta le textarea.';
    feedback.className = 'msg err';
    return;
  }

  const min = Number(gMin?.value ?? -9);
  const max = Number(gMax?.value ?? 9);

  const A = randomMatrix(m, n, min, max);
  const B = randomMatrix(n, p, min, max);

  // Popola le textarea...
  tA.value = matrixToTextarea(A);
  tB.value = matrixToTextarea(B);

  // ...e, se vuoi, (ri)costruisci le griglie coerenti
  if (dimM && dimN && dimP) {
    dimM.value = m; dimN.value = n; dimP.value = p;
    buildGrid(gridA, m, n, 'a'); writeGrid(gridA, A, 'a');
    buildGrid(gridB, n, p, 'b'); writeGrid(gridB, B, 'b');
    gridSummary.textContent = `Griglie create: A ${m}×${n}, B ${n}×${p}.`;
  }

  feedback.textContent = `Matrici generate: A ${m}×${n}, B ${n}×${p} (range ${Math.min(min,max)}..${Math.max(min,max)})`;
  feedback.className = 'msg ok';
  liveUpdate();
});

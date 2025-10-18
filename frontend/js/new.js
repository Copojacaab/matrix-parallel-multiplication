/**
 * new.js — pagina "Nuovo calcolo"
 * Flusso:
 * 1) Parsing delle textarea in matrici numeriche.
 * 2) Validazione (rettangolarità, numeri, compatibilità A m×n · B n×p).
 * 3) POST al backend con { matrixA, matrixB }.
 * 4) Redirect a status.html?jobId=...
 */

const BASE_URL = 'http://localhost:3000'; // backend dev

// Piccolo helper per selezioni DOM
const $ = (s) => document.querySelector(s);

// Riferimenti UI
const tA       = $('#matA');
const tB       = $('#matB');
const shapeA   = $('#shapeA');
const shapeB   = $('#shapeB');
const errA     = $('#errA');
const errB     = $('#errB');
const btnStart = $('#btnStart');
const feedback = $('#feedback');
const summary  = $('#summary');

// ------------------------
// Parsing e validazioni
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
      throw new Error(`Riga ${i + 1}: numero di valori diverso (${rows[i].length} ≠ ${nCols})`);
    }
    for (let j = 0; j < nCols; j++) {
      if (!Number.isFinite(rows[i][j])) {
        throw new Error(`Valore non numerico in riga ${i + 1}, colonna ${j + 1}`);
      }
    }
  }
  return rows;
}

// UI helpers
const fmtShape = (M) => (Array.isArray(M) ? `${M.length} × ${M[0]?.length ?? 0}` : '—');
const setError = (el, msg) => { el.textContent = msg; el.hidden = !msg; };

// Aggiornamento in tempo reale dei badge e degli errori locali
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

  // Messaggio compatibilità sintetico
  summary.textContent = compatSummary();
}

function compatSummary() {
  try {
    const A = parseMatrix(tA.value);
    const B = parseMatrix(tB.value);
    const m = A.length, n = A[0].length;
    const n2 = B.length, p = B[0].length;
    if (n !== n2) return `Compatibilità: ❌ (A è ${m}×${n}, B è ${n2}×${p} → ${n} ≠ ${n2})`;
    return `Compatibilità: ✅ (A ${m}×${n} · B ${n2}×${p} → risultato ${m}×${p})`;
  } catch {
    return 'Compatibilità: —';
  }
}

// Bind input live
tA.addEventListener('input', liveUpdate);
tB.addEventListener('input', liveUpdate);
liveUpdate(); // prima render

// ------------------------
// Invio al backend
// ------------------------

btnStart.addEventListener('click', async () => {
  feedback.textContent = ''; feedback.className = 'msg';

  // 1) Parsing + validazione con messaggi immediati
  let A, B;
  try { A = parseMatrix(tA.value); setError(errA, ''); tA.classList.remove('error'); }
  catch (e) { setError(errA, e.message); tA.classList.add('error'); return; }

  try { B = parseMatrix(tB.value); setError(errB, ''); tB.classList.remove('error'); }
  catch (e) { setError(errB, e.message); tB.classList.add('error'); return; }

  // 2) Compatibilità dimensioni per A(m×n) · B(n×p)
  const n = A[0].length, n2 = B.length;
  if (n !== n2) {
    feedback.textContent = 'Le dimensioni non sono compatibili (colonne di A ≠ righe di B).';
    feedback.className = 'msg err';
    return;
  }

  // 3) Payload conforme al backend: matrixA/matrixB
  const payload = { matrixA: A, matrixB: B };

  // 4) POST al backend
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

    // 5) Redirect alla pagina di stato
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

// ============= GENERAZIONE CASUALE =============

// Riferimenti ai controlli della card "Generazione casuale"
const gM   = document.querySelector('#gen-m');
const gN   = document.querySelector('#gen-n');
const gP   = document.querySelector('#gen-p');
const gMin = document.querySelector('#gen-min');
const gMax = document.querySelector('#gen-max');
const btnRandom = document.querySelector('#btnRandom');

/** Numero intero casuale in [min, max] */
function randInt(min, max) {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

/** Crea una matrice m×n con valori interi casuali in [min, max] */
function randomMatrix(m, n, min, max) {
  const M = new Array(m);
  for (let i = 0; i < m; i++) {
    const row = new Array(n);
    for (let j = 0; j < n; j++) row[j] = randInt(min, max);
    M[i] = row;
  }
  return M;
}

/** Converte matrice in testo (righe newline, valori separati da spazio) */
function matrixToTextarea(M) {
  return M.map(row => row.join(' ')).join('\n');
}

/** Se possibile, inferisci m,n,p dalle textarea correnti (comodo per rigenerazioni rapide) */
function inferDimsFromTextareas() {
  try {
    const A = parseMatrix(tA.value);
    const B = parseMatrix(tB.value);
    const m = A.length, n = A[0].length, p = B[0].length;
    return { m, n, p };
  } catch {
    return null;
  }
}

btnRandom?.addEventListener('click', (e) => {
  e.preventDefault();

  // 1) prendi dimensioni da input; se mancanti/0, prova a inferirle dalle textarea
  let m = Number(gM?.value || 0);
  let n = Number(gN?.value || 0);
  let p = Number(gP?.value || 0);

  if (!(m > 0 && n > 0 && p > 0)) {
    const inf = inferDimsFromTextareas();
    if (inf) { m = inf.m; n = inf.n; p = inf.p; }
  }

  if (!(m > 0 && n > 0 && p > 0)) {
    feedback.textContent = 'Imposta dimensioni valide (m, n, p > 0) o compila almeno una volta le textarea.';
    feedback.className = 'msg err';
    return;
  }

  // 2) intervallo numerico
  const min = Number(gMin?.value ?? -9);
  const max = Number(gMax?.value ?? 9);

  // 3) genera A(m×n) e B(n×p)
  const A = randomMatrix(m, n, min, max);
  const B = randomMatrix(n, p, min, max);

  // 4) popola le textarea e aggiorna UI/compatibilità
  tA.value = matrixToTextarea(A);
  tB.value = matrixToTextarea(B);
  feedback.textContent = `Matrici generate: A ${m}×${n}, B ${n}×${p} (range ${Math.min(min,max)}..${Math.max(min,max)})`;
  feedback.className = 'msg ok';

  // triggiamo l’aggiornamento dei badge/compatibilità con la tua funzione
  liveUpdate();
});


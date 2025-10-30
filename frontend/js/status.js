/**
 * status.js
 * 1) prendere il jobid dalla query string
 * 2) fare polling sulla route GET /api/jobs/:id ogni POLL_MS
 * 3) aggiornare UI
 */

const __DEBUG_CSV__ = true;
const BASE_URL = "http://localhost:3000";
const POLL_MS = 2000;
let timer = null;

const $ = (sel) => document.querySelector(sel);
const el = {
  jobId: $("#jobId"),
  status: $("#status"),
  tick: $("#tick"),
  note: $("#note"),
  created: $("#created"),
  completed: $("#completed"),
  exec: $("#exec"),
  dims: $("#dims"),
  previewWrap: $("#preview-wrap"),
};

const qs = new URLSearchParams(location.search);
const jobId = qs.get("jobId");
el.jobId.textContent = jobId || "—";

if (!jobId) {
  el.status.textContent = "jobId mancante";
  el.status.className = "status err";
  el.note.textContent =
    "Apri questa pagina passando ?jobId=... dalla home o dopo la POST.";
} else {
  startPolling(jobId);
}

// funzione per il polling
function startPolling(id) {
  // primo fetch immediato poi intervallo
  fetchOnce(id);
  timer = setInterval(() => fetchOnce(id), POLL_MS);
}

async function fetchOnce(id) {
  const started = Date.now();
  el.tick.textContent = new Date(started).toLocaleTimeString();

  try {
    // chiamata "light", senza matrici
    const res = await fetch(`${BASE_URL}/api/jobs/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    renderMeta(data);

    // se è terminale fermo il polling e carico l’anteprima completa
    if (isTerminal(data.status)) {
      const done = data.status === "completed";
      clearInterval(timer);
      timer = null;

      el.note.textContent = done
        ? "Calcolo completato ✅"
        : "Job fallito ❌";
      el.status.textContent = done ? "ok" : "errore";
      el.status.className = done ? "status ok" : "status err";

      // fetch "pesante" con matrici e render tabellare (con fallback raw)
      try {
        const d2 = await fetch(
          `${BASE_URL}/api/jobs/${encodeURIComponent(id)}?include=matrices`
        ).then((r) => r.json());
        renderPreviewFromJsonArray(d2);   
        updateDownloadUI(d2);
      } catch (e) {
        console.warn("Anteprima non disponibile:", e);
      }
    } else {
      // in progress
      el.status.textContent = data.status || "—";
      el.status.className = "status warn";
      el.note.textContent =
        "In esecuzione… (la pagina si aggiorna automaticamente)";
    }
  } catch (err) {
    console.error(err);
    el.status.textContent = "Errore di rete/API";
    el.status.className = "status err";
    el.note.textContent = String(err.message || err);
  }
}

function isTerminal(status) {
  return status === "completed" || status === "failed";
}

function fmtDate(s) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

function renderMeta(data) {
  // data: senza matrici
  el.status.textContent = data.status || "—";
  el.created.textContent = fmtDate(data.created_at);
  el.completed.textContent = fmtDate(data.completed_at);
  const comp = typeof data.compute_time_ms === "number" ? `${data.compute_time_ms} ms` : "—";
  const tot  = typeof data.exec_total_ms   === "number" ? `${data.exec_total_ms} ms`   : "—";
  el.exec.textContent =
    (comp !== "—" || tot !== "—")
      ? `compute=${comp} · pipeline=${tot}`
      : "—";

  // dimensioni con nomi tolleranti
  const m = Number(data.nra ?? data.rows_a);
  const n = Number(data.nca ?? data.cols_a);
  const p = Number(data.ncb ?? data.cols_b);

  if ([m, n, p].every(Number.isFinite)) {
    el.dims.textContent = `A ${m}x${n} . B ${n}x${p}`;
  } else {
    el.dims.textContent = "—";
  }
}

/* -------------------------- 
 *  ANTEPRIMA MATRICE
 * -------------------------- */

/**
 * trova stringa JSON matrice nel payload e la mostra come tabella. 
 * se non riesce, fallback raw.
 */
function renderPreviewFromJsonArray(job, maxR = 10, maxC = 10) {
  // possibili chiavi lato backend per il risultato
  const candidate = job.result_c 

  // già un array di array?
  if (Array.isArray(candidate) && Array.isArray(candidate[0])) {
    return renderMatrixTable(candidate, maxR, maxC);
  }

  // stringa JSON?
  if (typeof candidate === "string" && candidate.trim().startsWith("[")) {
    try {
      const mat = JSON.parse(candidate);
      if (Array.isArray(mat) && Array.isArray(mat[0])) {
        return renderMatrixTable(mat, maxR, maxC);
      }
    } catch (e) {
      console.warn("parse matrice fallito:", e);
    }
  }

  // fallback: stampa grezzo quello che c’è
  renderPreviewRaw(job);
}

/**
 * renderizza una tabella dalle prime maxR x maxC celle.
 * accetta array<array<number|string>>.
 */
function renderMatrixTable(mat, maxR = 10, maxC = 10) {
  const wrap = el.previewWrap;

  const rows = Array.isArray(mat) ? mat.length : 0;
  const cols = rows ? (Array.isArray(mat[0]) ? mat[0].length : 0) : 0;

  const r = Math.min(rows, maxR);
  const c = Math.min(cols, maxC);

  // stile inline (non ho voglia)
  const styleTable =
    "width:auto;border-collapse:separate;border-spacing:0;border-radius:8px;overflow:hidden;";
  const styleThTd =
    "padding:6px 10px;border:1px solid #1f2937;background:#0b1220;text-align:right;";
  const styleTh =
    "padding:6px 10px;border:1px solid #1f2937;background:#0f172a;text-align:center;font-weight:700;";

  let html = `<div style="margin-bottom:8px;color:#94a3b8;">Dimensioni rilevate: ${rows}×${cols}${rows>r||cols>c ? ` — mostrando ${r}×${c}` : ""}</div>`;
  html += `<table style="${styleTable}"><thead><tr>`;
  for (let j = 0; j < c; j++) html += `<th style="${styleTh}">c${j + 1}</th>`;
  html += `</tr></thead><tbody>`;

  for (let i = 0; i < r; i++) {
    html += `<tr>`;
    const row = Array.isArray(mat[i]) ? mat[i] : [];
    for (let j = 0; j < c; j++) {
      const val = row[j];
      html += `<td style="${styleThTd}">${formatCell(val)}</td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table>`;

  wrap.innerHTML = html;
}

/* utility per numeri compatti (6 dec max) */
function formatCell(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return String(v ?? "");
  const s = Math.abs(v) < 1e-12 ? "0" : Number(v.toFixed(6)).toString();
  return s;
}

/**
 * ANTEPRIMA RAW (no parsing) fai vedere qualunque cosa arrivi dal backend 
 */
function renderPreviewRaw(job) {
  const wrap = el.previewWrap;

  // Assicura formattazione leggibile
  wrap.style.whiteSpace = "pre";
  wrap.style.fontFamily =
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';
  wrap.style.fontSize = "14px";
  wrap.style.lineHeight = "1.35";

  // campi più probabili
  const src =
    job?.result_c ??
    job?.matrix_c ??
    job?.result ??
    job?.C ??
    job?.output ??
    job?.preview ??
    job; // fallback: tutto l'oggetto

  if (typeof src === "string") {
    wrap.textContent = src;
  } else {
    // serializza oggetti/array in JSON leggibile
    wrap.textContent = JSON.stringify(src, null, 2);
  }
}

/** ------------------------------------
 *        DOWNLOAD MATRICE
 * ------------------------------------- */
// estrae matrice result dal job (prende array o json)
function pickResultMatrix(job){
  const candidate = 
    job?.result_c ??
    job?.C ??
    job;

    // caso1: giá array di arr
    if(Array.isArray(candidate) && Array.isArray(candidate[0]))
      return candidate; //apposto cosi

    // caso2: string json --> parsing
    if(typeof(candidate) === 'string' && candidate.trim().startsWith('[')){
      try{
        const parsed = JSON.parse(candidate);
        // se parse corretto
        if(Array.isArray(parsed) && Array.isArray(parsed[0]))
          return parsed;
      } catch{ 
        // parsing fallito return null
      }
    }
    return null;
}

function matrixToCSV(mat){
  return mat.map((row) => row.map((v) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",")
  )
  .join("\n");
}

/** scarica un testo come file via blob+URL.createObjURL */
function downloadBlob(filename, mime, text){
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  // simulo pressione e scarico
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// assicura che i controlli di download siano presenti sotto l'anteprima
// crea il wrapper e i bottoni se non ci sono
function ensureDownloadUI(){
  const wrapId = "download-wrap";
  let wrap = document.getElementById(wrapId);

  // se non esiste
  if(!wrap){
    wrap = document.createElement("div");
    wrap.id = wrapId;
    wrap.className = "actions";
    wrap.style.marginTop = "12px";
    wrap.style.display = "none";

    // creo bottoni
    const btnJson = document.createElement("button");
    btnJson.id = "btn-dl-json";
    btnJson.className = "btn";
    btnJson.textContent = "Scarica JSON";

    const btnCSV = document.createElement("button");
    btnCSV.id = "btn-dl-csv";
    btnCSV.className = "btn";
    btnCSV.textContent = "Scarica CSV";

    const btnCopy = document.createElement("button");
    btnCopy.id = "btn-copy";
    btnCopy.className = "btn";
    btnCopy.textContent = "Copia contenuto negli appunti";

    wrap.appendChild(btnJson);
    wrap.appendChild(btnCSV);
    wrap.appendChild(btnCopy);

    // wrapper dopo anteprima
    el.previewWrap.parentNode.insertBefore(wrap, el.previewWrap.nextSibling);
  }
  return wrap;
}

/** aggiorno visibilitá dei btn in base al job (matrix disponibile) */
function updateDownloadUI(job){
  const wrap = ensureDownloadUI();
  const mat = pickResultMatrix(job);

  // finché non ho la matrice
  if(!mat){
    wrap.style.display = "none";
    return;
  }

  // matrice trovata, visibilita e event listener
  wrap.style.display = "";
  const btnJson = document.getElementById('btn-dl-json');
  const btnCSV = document.getElementById('btn-dl-csv');
  const btnCopy = document.getElementById('btn-copy');

  btnJson.onclick = () => { //scarica json
    const json = JSON.stringify(mat);
    console.log('diocane');
    const name = `matrix_result_${(job?.id || jobId || "job")}.json`;
    downloadBlob(name, "application/json", json);
  }
  btnCSV.onclick =() => { //scarica CSV 
      console.log("[CSV] click");
      console.log("[CSV] typeof matrixToCSV =", typeof matrixToCSV);
      const csv = matrixToCSV(mat);
      const name = `matrix_result_${(job?.id || jobId || "job")}.csv`;
      downloadBlob(name, "text/csv", csv);
  }
  btnCopy.onclick = async() => {
    console.log("[COPY] click")
    try{
      // prendo la matrice come stringa
      const text = mat.map((row) => row.join("\t")).join("\n");

      await navigator.clipboard.writeText(text); //copio negli appunti
      console.log("[COPY] matrice copiata, lunghezza: ", text.length);
      
      // feedback utente
      btnCopy.textContent = "✅ Copiata!";
      // back to reality
      setTimeout(() => (btnCopy.textContent = "Copia negli appunti"), 2000);
    }catch (err){
      console.error("[COPY] errore nella copia: ", err);
      alert("Impossibile copiare negli appunti: ", err.message);
    }
  }

}
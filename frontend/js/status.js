/**
 * status.js
 * 1) prendere il jobid dalla query string
 * 2) fare polling sulla route GET /api/jobs/:id ogni POLL_MS
 * 3) aggiornare UI
 */

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

      // fetch "pesante" con matrici e render tabellare (con fallback RAW)
      try {
        const d2 = await fetch(
          `${BASE_URL}/api/jobs/${encodeURIComponent(id)}?include=matrices`
        ).then((r) => r.json());
        renderPreviewFromJsonArray(d2);   // <— nuovo renderer
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

/* -------------------------- ANTEPRIMA MATRICE -------------------------- */

/**
 * Trova nel payload il campo che contiene la matrice come stringa JSON,
 * esegue JSON.parse e la mostra come tabella. Se non riesce, fallback RAW.
 */
function renderPreviewFromJsonArray(job, maxR = 10, maxC = 10) {
  // possibili chiavi lato backend per il risultato
  const candidate =
    job?.result_c ??
    job?.matrix_c ??
    job?.result ??
    job?.C ??
    job?.output ??
    job?.preview ??
    job;

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
 * Renderizza una tabella dalle prime maxR x maxC celle.
 * Accetta Array<Array<number|string>>.
 */
function renderMatrixTable(mat, maxR = 10, maxC = 10) {
  const wrap = el.previewWrap;

  const rows = Array.isArray(mat) ? mat.length : 0;
  const cols = rows ? (Array.isArray(mat[0]) ? mat[0].length : 0) : 0;

  const r = Math.min(rows, maxR);
  const c = Math.min(cols, maxC);

  // stile inline per non toccare il CSS globale
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

/* Utilità per rendere i numeri compatti (es. 6 decimali max) */
function formatCell(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return String(v ?? "");
  const s = Math.abs(v) < 1e-12 ? "0" : Number(v.toFixed(6)).toString();
  return s;
}

/**
 * ANTEPRIMA RAW (senza parsing)
 * Mostra qualunque cosa arrivi dal backend: stringa o oggetto.
 * Preserva gli a capo.
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

// frontend/js/bench.js
const BASE_URL = "http://localhost:3000"; // CORS già abilitato per 127.0.0.1:5500/localhost:5500
// vedi backend app.use(cors(...)) :contentReference[oaicite:2]{index=2}
const POLL_MS = 1500;

const $ = (s) => document.querySelector(s);
const el = {
  form: $("#bench-form"),
  sizes: $("#sizes"),
  procs: $("#procs"),
  repeats: $("#repeats"),
  seed: $("#seed"),
  oversub: $("#oversub"),
  runResult: $("#run-result"),
  batchId: $("#batchId"),
  tick: $("#tick"),
  note: $("#note"),
  tableWrap: $("#table-wrap"),
};

let currentBatchId = null;
let timer = null;

el.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  stopPolling();

  el.runResult.textContent = "Invio…";
  try {
    const body = {
      sizes: el.sizes.value.trim(),
      procs: el.procs.value.trim(),
      repeats: Number(el.repeats.value || 3),
      oversubscribe: !!el.oversub.checked,
    };
    const seedVal = el.seed.value.trim();
    if (seedVal !== "") body.seed = Number(seedVal);

    const res = await fetch(`${BASE_URL}/api/benchmarks/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    currentBatchId = data.batchId;
    el.batchId.textContent = currentBatchId || "—";
    el.runResult.textContent = "Benchmark avviato ✅";
    el.note.textContent = "Raccolgo risultati in tempo reale…";
    startPolling();
  } catch (err) {
    console.error(err);
    el.runResult.textContent = `Errore: ${err.message || err}`;
  }
});

function startPolling() {
  fetchOnce(); // subito
  timer = setInterval(fetchOnce, POLL_MS);
}
function stopPolling() {
  if (timer) clearInterval(timer);
  timer = null;
}

async function fetchOnce() {
  if (!currentBatchId) return;
  el.tick.textContent = new Date().toLocaleTimeString();

  try {
    const res = await fetch(`${BASE_URL}/api/benchmarks?batchId=${encodeURIComponent(currentBatchId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { batch, results } = await res.json();

    // Render tabella
    renderTable(results);

    // Heuristica: se tutte le combinazioni (serial per ogni n + tutte le mpi) sono terminali (ok/failed),
    // possiamo fermare il polling.
    const allDone = results.length > 0 && results.every(r => r.status === 'ok' || r.status === 'failed');
    if (allDone) {
      el.note.textContent = "Benchmark completato.";
      stopPolling();
    } else {
      el.note.textContent = "In esecuzione…";
    }
  } catch (err) {
    console.error(err);
    el.note.textContent = `Errore: ${err.message || err}`;
  }
}

function renderTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    el.tableWrap.textContent = "—";
    return;
  }

  // Ordina per n, poi per p (serial p=1 per primo)
  rows = [...rows].sort((a,b) => a.n - b.n || a.p - b.p);

  // Costruisci HTML tabellare
  const head = `
    <thead>
      <tr>
        <th>n</th>
        <th>mode</th>
        <th>p</th>
        <th>status</th>
        <th>time_ms</th>
        <th>speedup</th>
        <th>efficiency</th>
        <th>samples</th>
        <th>errore</th>
      </tr>
    </thead>`;
  const body = rows.map(r => `
      <tr>
        <td class="mono">${r.n}</td>
        <td>${r.mode}</td>
        <td class="mono">${r.p}</td>
        <td class="${r.status === 'ok' ? 'status ok' : (r.status === 'failed' ? 'status err' : 'status warn')}">${r.status}</td>
        <td class="mono">${fmtNum(r.time_ms)}</td>
        <td class="mono">${fmtNum(r.speedup)}</td>
        <td class="mono">${fmtNum(r.efficiency)}</td>
        <td class="mono">${fmtSamples(r.samples_json)}</td>
        <td style="max-width:320px">${r.error_msg ? `<span class="msg">${escapeHtml(r.error_msg)}</span>` : ''}</td>
      </tr>
  `).join("");

  const style = `
    <style>
      #table-wrap table { width:100%; border-collapse:separate; border-spacing:0; }
      #table-wrap th, #table-wrap td { padding:8px 10px; border:1px solid #1f2937; text-align:left; }
      #table-wrap th { background:#0f172a; position:sticky; top:0; }
      #table-wrap .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }
      #table-wrap .status { padding:2px 8px; border-radius:999px; display:inline-block; }
      #table-wrap .status.ok { background:#064e3b; color:#a7f3d0; }
      #table-wrap .status.err { background:#7f1d1d; color:#fecaca; }
      #table-wrap .status.warn { background:#1f2937; color:#e5e7eb; }
    </style>
  `;

  el.tableWrap.innerHTML = `${style}<div style="overflow:auto;max-height:400px"><table>${head}<tbody>${body}</tbody></table></div>`;
}

function fmtNum(x) {
  if (x == null) return "—";
  const n = Number(x);
  if (!Number.isFinite(n)) return String(x);
  return n.toFixed(3).replace(/\.?0+$/,'');
}
function fmtSamples(s) {
  if (!s) return "—";
  try {
    const arr = Array.isArray(s) ? s : JSON.parse(s);
    return arr.map(v => fmtNum(v)).join(", ");
  } catch { return String(s); }
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

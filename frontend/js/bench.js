const BASE_URL = "http://localhost:3000"; 
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

let chartSpeedup = null;
let chartTime = null;
let chartCombo = null;
let chartKF = null;
let chartGF = null;

// variabili per evitare aggiornamento completo tabella
let tableBodyEl = null;
let tableScrollerEl = null;
let tableInited = false;


const selSpeedupType = document.getElementById('speedupChartType');
const selTimeScale   = document.getElementById('timeScale');
const selComboN      = document.getElementById('comboN');

let lastRowsCache = [];
if (selSpeedupType) selSpeedupType.addEventListener('change', () => renderCharts(lastRowsCache));
if (selTimeScale)   selTimeScale.addEventListener('change',   () => renderCharts(lastRowsCache));
if (selComboN)      selComboN.addEventListener('change',      () => renderCharts(lastRowsCache));

let currentBatchId = null;
let timer = null;

//  collega un segmented control ad un select 
function bindSegmented(segId, selectEl, onChange) {
  const seg = document.getElementById(segId);
  if (!seg || !selectEl) return;

  const buttons = Array.from(seg.querySelectorAll('button'));

  const syncUI = () => {
    buttons.forEach(b => {
      const active = b.dataset.v === selectEl.value;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  };

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.v;
      if (selectEl.value !== val) {
        selectEl.value = val;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof onChange === 'function') onChange(val);
      }
      syncUI();
    });
  });

  // sync iniziale
  syncUI();
}

// Bind dei segmented ai select nascosti
bindSegmented('speedupSeg', selSpeedupType,  () => renderCharts(lastRowsCache));
bindSegmented('timeScaleSeg', selTimeScale,  () => renderCharts(lastRowsCache));



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

    // Render tabella e grafici
    renderTable(results);
    lastRowsCache = results;
    renderCharts(results);
    
    // se tutte le esecuzioni sono terminali => ok/failed
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
    tableInited = false;           // se non ci sono dati ricreo alla prossima
    tableBodyEl = null;
    tableScrollerEl = null;
    return;
  }

  // ordina per n poi p
  rows = [...rows].sort((a,b) => a.n - b.n || a.p - b.p);

  // costruisci head una sola volta
  const headHTML = `
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

  // inizializzazione una sols volta
  if (!tableInited) {
    const style = `
      <style>
        #table-wrap table { width:100%; border-collapse:separate; border-spacing:0; }
        #table-wrap th, #table-wrap td { padding:8px 10px; border:1px solid #1f2937; text-align:left; }
        #table-wrap th { background:#0f172a; position:sticky; top:0; z-index:1; }
        #table-wrap .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }
        #table-wrap .status { padding:2px 8px; border-radius:999px; display:inline-block; }
        #table-wrap .status.ok { background:#064e3b; color:#a7f3d0; }
        #table-wrap .status.err { background:#7f1d1d; color:#fecaca; }
        #table-wrap .status.warn { background:#1f2937; color:#e5e7eb; }
      </style>`;

    el.tableWrap.innerHTML = `
      ${style}
      <div class="tbl-scroll" style="overflow:auto;max-height:400px">
        <table>
          ${headHTML}
          <tbody></tbody>
        </table>
      </div>`;

    tableScrollerEl = el.tableWrap.querySelector('.tbl-scroll');
    tableBodyEl     = el.tableWrap.querySelector('tbody');
    tableInited     = true;
  }

  // salva posizione di scroll prima dell’aggiornamento
  const prevTop  = tableScrollerEl ? tableScrollerEl.scrollTop  : 0;
  const prevLeft = tableScrollerEl ? tableScrollerEl.scrollLeft : 0;

  // revuild solo body
  const bodyHTML = rows.map(r => `
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
    </tr>`).join("");

  tableBodyEl.innerHTML = bodyHTML;

  // ripristina lo scroll
  if (tableScrollerEl) {
    tableScrollerEl.scrollTop  = prevTop;
    tableScrollerEl.scrollLeft = prevLeft;
  }
}


function renderCharts(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;

  // indici utili lista
  const nList = [...new Set(rows.map(r => r.n))].sort((a,b)=>a-b);
  const pList = [...new Set(rows.filter(r => r.mode==='mpi').map(r => r.p))].sort((a,b)=>a-b);

  // Ts per n seriale OK
  const TsByN = new Map();
  for (const r of rows) {
    if (r.mode === 'serial' && r.status === 'ok' && Number.isFinite(r.time_ms)) {
      TsByN.set(r.n, r.time_ms);
    }
  }

  // popolazione  select n del grafico combinato 
  if (selComboN && selComboN.options.length !== nList.length) {
    selComboN.innerHTML = nList.map(n => `<option value="${n}">${n}</option>`).join('');
  }
  const nSel = selComboN ? Number(selComboN.value || nList[0]) : nList[0];

  // ---------- SPEEDUP MATRIX ----------
  const speedupDataByN = nList.map(n =>
    pList.map(p => {
      const row = rows.find(r => r.n===n && r.mode==='mpi' && r.p===p && r.status==='ok' && Number.isFinite(r.time_ms));
      const Ts = TsByN.get(n);
      return (row && Ts) ? Ts / row.time_ms : null;
    })
  );

  // ---------- SPEEDUP vs p  ----------
  const ctxS = document.getElementById('chart-speedup')?.getContext('2d');
  if (ctxS) {
    const speedupType = selSpeedupType ? selSpeedupType.value : 'bar';
    const speedupDatasets =
      speedupType === 'bar'
        ? nList.map((n, i) => ({ label: `n=${n}`, data: speedupDataByN[i] }))
        : nList.map((n, i) => ({ label: `n=${n}`, data: speedupDataByN[i], spanGaps: true, tension: 0.2 }));

    if (!chartSpeedup || chartSpeedup.config.type !== speedupType) {
      if (chartSpeedup) chartSpeedup.destroy();
      chartSpeedup = new Chart(ctxS, {
        type: speedupType,
        data: { labels: pList, datasets: speedupDatasets },
        options: {
          responsive: true,
          // plugins: { legend: { position: 'bottom' }, tooltip: { mode: 'index', intersect: false } },
          scales: {
            x: { title: { display: true, text: 'p (processi MPI)' } },
            y: { title: { display: true, text: 'speedup (Ts/Tp)' }, beginAtZero: true }
          }
        }
      });
    } else {
      chartSpeedup.data.labels = pList;
      chartSpeedup.data.datasets = speedupDatasets;
      chartSpeedup.update('none');
    }
  }


  // ---------- TEMPO vs n----------
  const ctxT = document.getElementById('chart-time')?.getContext('2d');
  if (ctxT) {
    const serialTimes = nList.map(n => {
      const Ts = rows.find(r => r.n===n && r.mode==='serial' && r.status==='ok');
      return Ts ? Ts.time_ms : null;
    });
    const dsTime = [{
      label: 'serial (p=1)',
      data: serialTimes,
      tension: 0.25,
      spanGaps: true
    }];
    for (const p of pList) {
      const data = nList.map(n => {
        const row = rows.find(r => r.n===n && r.mode==='mpi' && r.p===p && r.status==='ok');
        return row ? row.time_ms : null;
      });
      dsTime.push({ label: `mpi p=${p}`, data, tension: 0.25, spanGaps: true });
    }
    const yScaleType = selTimeScale ? selTimeScale.value : 'linear';

    if (!chartTime) {
      chartTime = new Chart(ctxT, {
        type: 'line',
        data: { labels: nList, datasets: dsTime },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom' }, tooltip: { mode: 'index', intersect: false } },
          scales: {
            x: { title: { display: true, text: 'n (dimensione)' } },
            y: { type: yScaleType, title: { display: true, text: 'tempo (ms)' }, beginAtZero: true }
          }
        }
      });
    } else {
      chartTime.data.labels = nList;
      chartTime.data.datasets = dsTime;
      chartTime.options.scales.y.type = yScaleType;
      chartTime.update('none');
    }
  }

  // ---------- COMBINATO  ----------
  const ctxC = document.getElementById('chart-combo')?.getContext('2d');
  if (ctxC) {
    const Ts = TsByN.get(nSel);
    const speedup = pList.map(p => {
      const r = rows.find(x => x.n===nSel && x.mode==='mpi' && x.p===p && x.status==='ok' && Number.isFinite(x.time_ms));
      return (r && Ts) ? Ts / r.time_ms : null;
    });
    const efficiency = speedup.map((s, i) => (s != null ? s / pList[i] : null));

    const data = {
      labels: pList,
      datasets: [
        { type: 'bar',  label: `speedup (n=${nSel})`,     data: speedup,   yAxisID: 'y'  },
        { type: 'line', label: `efficiency (n=${nSel})`,  data: efficiency, yAxisID: 'y1', spanGaps: true, tension: 0.2 }
      ]
    };
    const options = {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          mode: 'index', intersect: false,
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed.y;
              if (ctx.datasetIndex === 0) {
                const s = Number(val);
                const pct = Number.isFinite(s) ? (100*(s-1)).toFixed(1) : null;
                return ` speedup: ${fmtNum(s)}${pct!=null?`  (Δ ${pct}% vs seriale)`:''}`;
              } else {
                return ` efficiency: ${fmtNum(val)}`;
              }
            }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: 'p (processi MPI)' } },
        y:  { position: 'left',  beginAtZero: true, title: { display: true, text: 'speedup (Ts/Tp)' } },
        y1: { position: 'right', beginAtZero: true, max: 1,  title: { display: true, text: 'efficiency (S/p)' }, grid: { drawOnChartArea: false } }
      }
    };

    if (!chartCombo) {
      chartCombo = new Chart(ctxC, { type: 'bar', data, options });
    } else {
      chartCombo.data = data;
      chartCombo.options = options;
      chartCombo.update('none');
    }
  }

  // ---------- Karp–Flatt epsilon vs p & GFLOPS vs p (per n selezionato) ----------
  // karp-flatt => quanto ovehead (parte seriale) abbiamo nel programma parallelo
  // gflops: lavoro che viene eseguito al secondo, prestazioni del calcolo
  const TsSel = TsByN.get(nSel);
  const rowsForNSel = pList.map(p => rows.find(r => r.n===nSel && r.mode==='mpi' && r.p===p && r.status==='ok'));

  // Karp–Flatt: ε = (1/S - 1)/(1 - 1/p)
  const kfData = rowsForNSel.map((row, i) => {
    if (!row || !TsSel || !Number.isFinite(row.time_ms)) return null;
    const p = pList[i];
    const S = TsSel / row.time_ms;
    const eps = (1/S - 1) / (1 - 1/p);
    return eps;
  });

  const ctxKF = document.getElementById('chart-kf')?.getContext('2d');
  if (ctxKF) {
    const dsKF = [{ label: `Karp–Flatt ε (n=${nSel})`, data: kfData, spanGaps: true, tension: 0.2 }];
    if (!chartKF) {
      chartKF = new Chart(ctxKF, {
        type: 'line',
        data: { labels: pList, datasets: dsKF },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom' } },
          scales: {
            x: { title: { display: true, text: 'p' } },
            y: { title: { display: true, text: 'ε (fractions of serial/overhead)' }, beginAtZero: true }
          }
        }
      });
    } else {
      chartKF.data.labels = pList;
      chartKF.data.datasets = dsKF;
      chartKF.update('none');
    }
  }

  // GFLOPS = (2 n^3) / (Tp_s * 1e9)  con Tp_s = time_ms/1000
  const ctxGF = document.getElementById('chart-gflops')?.getContext('2d');
  if (ctxGF) {
    const gflops = rowsForNSel.map(row => {
      if (!row || !Number.isFinite(row.time_ms)) return null;
      const ops = 2 * Math.pow(nSel, 3);
      const gfl = ops / ((row.time_ms/1000) * 1e9);
      return gfl;
    });
    const dsGF = [{ label: `GFLOPS (n=${nSel})`, data: gflops, spanGaps: true, tension: 0.2 }];
    if (!chartGF) {
      chartGF = new Chart(ctxGF, {
        type: 'line',
        data: { labels: pList, datasets: dsGF },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom' } },
          scales: {
            x: { title: { display: true, text: 'p' } },
            y: { title: { display: true, text: 'GFLOPS' }, beginAtZero: true }
          }
        }
      });
    } else {
      chartGF.data.labels = pList;
      chartGF.data.datasets = dsGF;
      chartGF.update('none');
    }
  }
}

// helper
function fmtNum(x) {
  if (x == null) return "—";
  const n = Number(x);
  if (!Number.isFinite(n)) return String(x);
  return n.toFixed(3).replace(/\.?0+$/,'');
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

// ==================================================
// history.html — cronologia con ordinamento, filtro e ricerca
// ==================================================
// Cosa fa:
// - Chiama GET /api/jobs?limit&offset&sort&status&q
// - Mostra la tabella dei job con paginazione
// - Consente ordinamento (asc/desc), filtro per status, ricerca per id (parziale)
// - Usa "total" dal server per gestire "Carica altri"

const BASE_URL = 'http://localhost:3000';
const LIMIT = 20;

const $ = (s) => document.querySelector(s);

// UI principali
const tbody = $('#tbody');
const shown = $('#shown');
const total = $('#total');
const btnMore = $('#btnMore');

// Controlli
const sortSel = $('#sort');
const statusSel = $('#status');
const qInput = $('#q');
const btnApply = $('#btnApply');
const btnRefresh = $('#btnRefresh');

// Stato locale di paginazione e filtri
let offset = 0;
let totalCount = 0;

btnMore.addEventListener('click', loadPage);

// Applica filtri: resetta paginazione e ricarica
btnApply.addEventListener('click', applyFilters);

// Enter sulla ricerca → applica
qInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') applyFilters();
});

btnRefresh.addEventListener('click', applyFilters);

// Prima pagina
applyFilters();

function applyFilters() {
  offset = 0;
  shown.textContent = '0';
  btnMore.hidden = false;
  tbody.innerHTML = `<tr><td colspan="6" class="help">Caricamento…</td></tr>`;
  loadPage();
}

async function loadPage() {
  btnMore.disabled = true; btnMore.textContent = 'Carico…';
  try {
    const sort = (sortSel?.value || 'desc').toLowerCase();
    const status = (statusSel?.value || '').trim();
    const q = (qInput?.value || '').trim();

    const params = new URLSearchParams({
      limit: String(LIMIT),
      offset: String(offset),
      sort,
    });
    if (status) params.set('status', status);
    if (q) params.set('q', q);

    const url = `${BASE_URL}/api/jobs?${params.toString()}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const data = await res.json();

    // Server ora restituisce total=conteggio complessivo, items=pagina corrente
    totalCount = Number(data.total || 0);
    total.textContent = totalCount;

    const items = Array.isArray(data.items) ? data.items : [];
    if (offset === 0) tbody.innerHTML = '';

    for (const j of items) tbody.appendChild(rowFor(j));

    offset += items.length;
    shown.textContent = String(offset);
    btnMore.hidden = (offset >= totalCount);

    if (offset === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="help">Nessun job trovato.</td></tr>`;
    }
  } catch (err) {
    console.error(err);
    if (offset === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="help" style="color:var(--err)">Errore: ${String(err.message || err)}</td></tr>`;
    }
  } finally {
    btnMore.disabled = false; btnMore.textContent = 'Carica altri';
  }
}

function rowFor(j) {
  const tr = document.createElement('tr');

  // 1) Job (ID cliccabile)
  const c1 = document.createElement('td');
  const a = document.createElement('a');
  a.className = 'mono';
  a.href = `status.html?jobId=${encodeURIComponent(j.id)}`;
  a.textContent = j.id;
  c1.appendChild(a);
  if (j.error_msg) {
    const p = document.createElement('div');
    p.className = 'help';
    p.style.marginTop = '4px';
    p.textContent = String(j.error_msg).slice(0, 120);
    c1.appendChild(p);
  }

  // 2) Stato (badge)
  const c2 = document.createElement('td');
  const b = document.createElement('span');
  b.className = 'badge ' + (
    j.status === 'completed' ? 's-ok' :
    j.status === 'failed'    ? 's-err' : 's-warn'
  );
  b.textContent = j.status || '—';
  c2.appendChild(b);

  // 3) Durata
  const c3 = document.createElement('td'); c3.className = 'right';
  c3.textContent = (typeof j.execution_time_ms === 'number') ? `${j.execution_time_ms} ms` : '—';

  // 4) Creato
  const c4 = document.createElement('td'); c4.textContent = fmtDate(j.created_at);

  // 5) Completato
  const c5 = document.createElement('td'); c5.textContent = fmtDate(j.completed_at);

  // 6) Dimensioni
  const c6 = document.createElement('td');
  c6.textContent = `A ${j.nra}×${j.nca} · B ${j.nca}×${j.ncb}`;

  tr.append(c1, c2, c3, c4, c5, c6);
  return tr;
}

function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

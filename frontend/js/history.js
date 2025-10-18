  // ==================================================
    // history.html — cronologia con metadati "leggeri"
    // ==================================================
    // Cosa fa:
    // - Chiama GET /api/jobs?limit=L&offset=O&sort=desc
    // - Renderizza una riga per job (ID cliccabile → status.html?jobId=...)
    // - Pagina lato client con bottone "Carica altri"
    // - "Aggiorna" ricarica dall'inizio

    const BASE_URL = 'http://localhost:3000';
    const LIMIT = 20; // righe per pagina

    const $ = (s) => document.querySelector(s);
    const tbody = $('#tbody');
    const shown = $('#shown');
    const total = $('#total');
    const btnMore = $('#btnMore');
    const btnRefresh = $('#btnRefresh');

    let offset = 0;     // posizione corrente
    let totalCount = 0; // totale dal server

    btnMore.addEventListener('click', loadPage);
    btnRefresh.addEventListener('click', refresh);

    // prima pagina
    loadPage();

    async function loadPage() {
      btnMore.disabled = true; btnMore.textContent = 'Carico…';
      try {
        const url = `${BASE_URL}/api/jobs?limit=${LIMIT}&offset=${offset}&sort=desc`;
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();

        totalCount = Number(data.total || 0);
        total.textContent = totalCount;

        const items = Array.isArray(data.items) ? data.items : [];
        if (offset === 0) tbody.innerHTML = ''; // prima pagina: pulisco

        for (const j of items) tbody.appendChild(rowFor(j));

        offset += items.length;
        shown.textContent = offset;
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

    function refresh() {
      offset = 0;
      shown.textContent = '0';
      btnMore.hidden = false;
      tbody.innerHTML = `<tr><td colspan="6" class="help">Caricamento…</td></tr>`;
      loadPage();
    }

    function rowFor(j) {
      const tr = document.createElement('tr');

      // 1) Job (ID link + eventuale errore sintetico)
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

      // 2) Stato (badge colorato)
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

      // 6) Dimensioni (metadati leggeri)
      const c6 = document.createElement('td');
      const hasAB = [j.nra, j.nca, j.nc].every(v => typeof v === 'number');
      c6.textContent = `A ${j.nra}×${j.nca} · B ${j.nca}×${j.ncb}`;

      tr.append(c1, c2, c3, c4, c5, c6);
      return tr;
    }

    function fmtDate(s) {
      if (!s) return '—';
      try { return new Date(s).toLocaleString(); } catch { return s; }
    }
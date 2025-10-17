/** welcome.js (index)
 * 1) Aggiorna l'anno nel footer
 * 2) Health check del backend
 * 3) Mostra numero job recenti e stato dell'ultimo
 */

const BASE_URL = "http://localhost:3000";
const $ = (sel) => document.querySelector(sel);
const healthPill = $("#health-pill");
const statTotal  = $("#stat-total");
const statLast   = $("#stat-last");
const lastLink = $("#last-link");
const statTime = $("#stat-time");

// 1) Footer year
$("#anno").textContent = new Date().getFullYear();

// 2) Health check + stats
(async function checkBackend() {
  const url = `${BASE_URL}/api/jobs?limit=5&sort=desc`;
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      healthPill.className = "pill warn";
      healthPill.textContent = `Backend risponde con status ${res.status}`;
      return;
    }

    const data  = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];

    healthPill.className = "pill ok";
    healthPill.textContent = "Backend ONLINE";

    statTotal.textContent = items.length;
    if (items.length > 0) {
      const last = items[0]; // sort=desc → più recente
      statLast.textContent = last.status || "—";

      // link al dettaglio del last job
      if(lastLink){
        lastLink.textContent = last.id;
        lastLink.href = `status.html?jobId=${encodeURIComponent(last.id)}`;
      }

      // durata
      if(statTime){
        statTime.textContent = (typeof(last.execution_time_ms) === 'number')
        ? last.execution_time_ms + " ms" 
        : '-';
      }
    } else {
      statLast.textContent = "nessun job";
      // tolgo href al link per il dettaglio  del last job
      if(lastLink){
        lastLink.textContent = "—";
        lastLink.removeAttribute("href");
      }

      if(statTime){
        statTime.textContent = "—";
      }
    }
  } catch (err) {
    console.warn("Health check fallito:", err);
    healthPill.className = "pill err";
    healthPill.textContent = "Backend NON raggiungibile";
    statTotal.textContent = "—";
    statLast.textContent = "—";
  }
})();

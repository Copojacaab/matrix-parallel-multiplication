# matrix-parallel-multiplication


### ## Fase 1: Sviluppo del "Motore" di Calcolo (Backend Core) ⚙️
**Obiettivo:** Creare un nucleo funzionante e testabile che collega Node.js e il programma C, completamente isolato dal web.

1.  **Modifica del Programma C/MPI:**
    * Prendiamo `mpimm.c` e lo modifichiamo per **leggere le matrici da due file di input** e **scrivere la matrice risultato su un file di output**.
    * I nomi di questi tre file verranno passati come argomenti da riga di comando.
    * **Test:** Compileremo il nuovo codice con `mpicc` e lo testeremo direttamente da terminale per assicurarci che legga e scriva correttamente.

2.  **Creazione dello Script di Invocazione in Node.js:**
    * Scriveremo un semplice script `test.js` (non ancora un server web).
    * Questo script userà il modulo `child_process` per:
        1.  Creare due file di input (`matrice_A.txt`, `matrice_B.txt`) con dati di esempio.
        2.  Lanciare il comando `mpiexec -n 4 --oversubscribe ./mpimm_eseguibile`.
        3.  Attendere che il processo termini e verificare che il file di output (`risultato.txt`) sia stato creato correttamente.

---
### ## Fase 2: Creazione dell'API Server (Backend API) 🌐
**Obiettivo:** "Esporre" il motore di calcolo tramite un'API RESTful, rendendolo accessibile via web.

1.  **Setup del Server Express:**
    * Inizializzeremo un nuovo progetto Node.js (`npm init`) e installeremo Express.
    * Creeremo il file `server.js` con la struttura base di un'applicazione Express.

2.  **Implementazione degli Endpoint API:**
    * **`POST /api/jobs`**: Questo endpoint riceverà i dati delle matrici dal client in formato JSON. La sua logica sarà molto simile a quella dello script di test della Fase 1: genererà un ID unico per il lavoro, creerà i file di input e avvierà il processo C/MPI. Risponderà immediatamente al client con l'ID del lavoro.
    * **`GET /api/jobs/:id/result`**: Questo endpoint controllerà lo stato del lavoro. Se il calcolo è terminato, leggerà il file di risultato, lo convertirà in JSON e lo invierà al client. Altrimenti, comunicherà che il lavoro è ancora "in elaborazione".

---
### ## Fase 3: Sviluppo dell'Interfaccia (Frontend) 🖥️
**Obiettivo:** Costruire la pagina web che l'utente utilizzerà per interagire con il nostro servizio.

1.  **Struttura HTML:**
    * Creeremo un file `index.html` con i campi per inserire le dimensioni e i dati delle matrici, un pulsante di invio e delle aree per mostrare lo stato e il risultato.

2.  **Logica JavaScript (client.js):**
    * Scriveremo il codice che, al click del pulsante:
        1.  Raccoglie i dati dal form e li impacchetta in JSON.
        2.  Usa l'API `fetch` per inviare la richiesta `POST` al nostro server.
        3.  Una volta ricevuto l'ID del lavoro, avvia un **polling**: a intervalli regolari (es. ogni 2 secondi), interroga l'endpoint `GET /api/jobs/:id/result` fino a quando non ottiene la matrice finale.
        4.  Visualizza il risultato sulla pagina.

---
### ## Fase 4: Integrazione e Test Completo 🔗
**Obiettivo:** Mettere insieme tutti i pezzi e testare il flusso completo.

1.  **Avvio del Sistema:** Lanceremo il server Node.js.
2.  **Test End-to-End:** Apriremo `index.html` nel browser, inseriremo i dati di due matrici e verificheremo che l'intero processo funzioni come previsto, dalla richiesta fino alla visualizzazione del risultato corretto.

---
### ## Fase 5: Analisi delle Prestazioni 📊
**Obiettivo:** Raccogliere i dati per la relazione finale e dimostrare il guadagno prestazionale, come richiesto dalla traccia.

1.  **Benchmark:**
    * Misureremo il tempo di esecuzione del calcolo seriale ($T_{seriale}$) usando il programma `sermm.c`.
    * Misureremo il tempo di esecuzione del nostro sistema parallelo ($T_{parallelo}$) al variare del numero di worker (es. `N = 2, 4, 8`).

2.  **Calcolo e Grafici:**
    * Calcoleremo lo **Speedup** ($S_N = T_{seriale} / T_{parallelo}(N)$) e l'**Efficienza** ($E_N = S_N / N$).
    * Presenteremo i risultati in una tabella e un grafico, pronti per la relazione finale del progetto.



<!-- MOCKING NEI TEST DI INDEX.JS -->
nel comando in cui mokko, ad esempio quando lo faccio con child_process, e' come se gli dicessi: prendi il modulo child_process di node.js, che contiene comandi reali come spawn, fork e exec. Da questo modulo prendi il comando exec e sostituiscilo con la funzione fn di jest che si limita a simulare, restituendo quello che vogliamo noi. Nel frattamempo ascolta come viene chiamata e quanto, possiamo usare queste informazioni per capire come siamo messi in realta e testare.


## TEST SU INDEX.JS
1. Validazione input: 400 se matrix mancano, o dimensioni non compatibili  ✅
2. Creazione del job sul db: creteJob chiamato con jobId e dimensioni corretti ✅
3. Errori I/O: se errori di scrittura mat_a o mat_b allora return 500 e updateJobFailure ✅
4. Errore nel worker: se exec ha cb con error allora return 500 e updateJobFailure
5. Errore read: se readC falisce return 500
6. Happy path: 200 con {message, jobId, result}

13/10/25
### MILESTONE 3 (refactor asincrono)
Il client non deve essere bloccato da un endpoint pesante, deve rispondere subito con 202 e il jobId. l'elaborazione della richiesta avviene in background, il client  interroga lo stato e il risultato del lavoro.

#### Passo 1: decoupling runJob
estraggo la logica che viene eseguita dopo aver risposto con 202

L'handler HTTP crea il job, risponde al client con 202 e avvia il runner in macrotask, in runner.js facciamo:
- transizione a running
- i/o su file A/B/C
- esecuzione di MPI
- lettura del risultato
- transizione a completed o failed

TEST: verificano solo il runner!!!!
vogliamo verificare la macchina a stati del runner, la misurazione del tempo di esecuzione e il cleanup best-effort dei file temp.

Ora scrivo test dell'endpoint: POST valido allora faccio subito 202 con jobId, poi avvio il runner in macrotask.
### MILESTONE 4
Obbiettivo: rendere navigabile lo storico dei job salvati nel db con nuovi endpoint.
1. GET /api/jobs: ha la funzione di elencare i jobs(filtrabile e ordinabile), restituisce una lista di record JSON(i jobs)
2. GET /api/jobs/:id/status: ha la funzione di restituire i metadati(stato, tempi...)
3. GET /api/jobs/:id/result: ha la funzione di restituire il risultato del job se completed, altrimenti 404

TEST:
1. GET /api/jobs:
    - se non metto filtri, allora mi restituisce una lista non vuota
    - se filtro per status = completed, allora mi restituisce solo job completed
    - se ordino per data_des allora mi restituisce i job in ordine di creazione decrescente
2. GET /api/jobs/:id/status: 
    - restituisce solamente i metadati, senza result o input
3. GET /api/jobs/:id/result:
    - se il job é completed restituisce il risultato
    - se il lavoro non é completed --> 409 con messaggio chiaro
    - se il lavoro non esiste --> 404
    
<!-- CURL -->
# 1) dettaglio del job completato
curl -s http://localhost:3000/api/jobs/716f09256dfcedd3| jq

# 2) storico completo (default: dal più recente)
curl -s "http://localhost:3000/api/jobs" | jq '.total, .items[0].id, .items[0].status, .items[0].created_at'

# 3) solo completati
curl -s "http://localhost:3000/api/jobs?status=completed" | jq '.total'

# 4) ordinamento crescente
curl -s "http://localhost:3000/api/jobs?sort=asc" | jq '.items | map(.created_at)'

# 5) paginazione
curl -s "http://localhost:3000/api/jobs?limit=2&offset=2" | jq '.items | length'

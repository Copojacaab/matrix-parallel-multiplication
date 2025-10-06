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

Questo piano ci dà una visione completa e strutturata. Che ne pensi? Se ti sembra chiaro, possiamo iniziare con il **Passo 1.1: Modifica del Programma C/MPI**.
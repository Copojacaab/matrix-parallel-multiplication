=============================================   DOCUMENTAZIONE  =============================================

MatrixLab é un sistema web per l'esecuzione di moltiplicazioni di matrici, con supporto sia per le esecuzioni seriali che parallele.

ARCHITETTURA GENERALE
- il frontend manda richieste HTTP al backend
- il backend salva le informazioni del job nel database `jobs`
- il runner crea file di input per le matrici, lancia il binario (mpi o ser), raccoglie i risultati e aggiorna db
- l'utente puó vedere i risultati, lo stato, e fare bechmark dal browser

COMPONENTI PRINCIPALI
- DB MySQL (definito in `init_matrixlab.sql`)
    jobs: memorizza moltiplicazioni (status, tempi, file path, errori)
    benchmark_batches e benchmark_results: archivio meta e risultati dei test di performance

    Connessione e pool in `db_mysql.js`\

- BckEnd Node.js (Express)
    entrypoint: index.js => API REST per gestione job e bench (tutto qua)

    API:
        - GET /api/jobs =>  lista e filtro job
        - GET /api/jobs/:id => dettaglio singolo job (light o con matrices)
        - POST /api/jobs => invia due matrici e crea un job
        - POST /api/benchmarks/run => avvia batch di test MPI
        - GET /api/benchmarks?batchId=... => restituisce i risultati e calcola lo speedup l'efficienza

    LOGICA DI CALCOLO:
    Usa runner.js per i calcoli:
        - genera file `A.txt` e `B.txt`
        - prova esecuzione parallela tramite mpirun
        - se fallisce => eseguo la versione seriale
        - salva C.txt, i tempi di esecuzione e i risultati in result.json (fs)
        - aggiorna db (running -> completed/failed)  

- Worker C(MPI)
    file: mpimm.c
    
    Implementa la moltiplicazione di matrici tramite MPI
        - master legge le matrici dai file e distribuisce le rows ai worker
        - ogni worker calcola la sua porzione (rows e tutta matrice B) e invia risultati al master
        - il master ricompone la matrice C e la salva su file
        - stampa il tempo di calcolo su stdout, catturato dal bckend

- Benchmark
    file: benchmark_runner.js, bench_utils.js, _benchmark_repository.mysql.js

    Test delle performance con diverse dimensioni n e numero di processi p:
        - genera automaticamente matrici casuali (anche seed)
        - esegue il calcolo repeats volte
        - calcola la mediana dei tempi (togliendo warm-up)
        - salva i tempi, lo speedup, l'efficienza, gflops e karp-flatt nel db

- Frontend:
    - index.html => home con health check del backend e statistiche dell'ultimo job
    - new.html => inserimento delle matrici
    - status.html => visualizzazione dello stato e dell'anteprima del risultato
    - bench.html => esecuzione e visualizzazione di benchmarks

FLUSSO DI UN JOB
 1. L'utente inserisce due matrici in new.html
 2. il frontend invia un POST /api/jobs
 3. il backend
    - valida le matrici (utils/validate.js)
    - crea un record in jobs
    - genera il payload.json, A.txt e B.txt
    - avvia runner.start() in background
4. runner.js esegue:
    - mpirun --> mpimm_exec --> genera C.txt
    - salva result.json
    - aggiorna db con tempi di esecuzione
5. l'utente puó vedere il progresso del job in status.html
6. quando il job é completato si puó scaricare il file completo (JSON, CSV, copy)

TECNOLOGIE
- bckend: Node.js(express), MySQL2 
- frontend: HTML, CSS, JS
- database: MySQL 8
- calcolo parallelo: MPI (openMPI, C)
- visualizzazione grafici: Charts.js
- sistema operativo target: linux o mac con mpirun

============================================= ISTRUZIONI PER L'ESECUZIONE ============================================= 

!!!!!!!!!!!!!!!!!! DA backend/: !!!!!!!!!!!!!!!!!

1) dipendenze
    npm i

2) prepara env (db e compilazione worker)
    sudo mysql
    CREATE USER 'matrix_admin'@'localhost' IDENTIFIED BY 'pass1';
    CREATE USER 'matrix_admin'@'%'         IDENTIFIED BY 'pass1';
    GRANT ALL PRIVILEGES ON *.* TO 'matrix_admin'@'localhost' WITH GRANT OPTION;
    GRANT ALL PRIVILEGES ON *.* TO 'matrix_admin'@'%'         WITH GRANT OPTION;
    FLUSH PRIVILEGES;
    EXIT;

    npm sun setup

3) avvia server (watch)
    npm run start

4) veririca rapida 
    curl http://localhost:3000/api/benchmarks/run -H "content-type: application/json" \
    -d '{"sizes":"128,256","procs":"2,4"}'

5) frontend:
    http://localhost:3000
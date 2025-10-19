#include <stdio.h>
#include <stdlib.h>
#include <time.h>

// Macro per convertire la struct timespec in un double (secondi)
#define TIMESPEC_TO_SECONDS(ts) ((double)(ts).tv_sec + (double)(ts).tv_nsec / 1000000000.0)

/**************************** FUNZIONI HELPER ************************************/

/**
 * @brief Alloca dinamicamente una matrice 2D di double.
 * * @param rows Il numero di righe della matrice.
 * @param cols Il numero di colonne della matrice.
 * @return Un puntatore a puntatore (double**) alla matrice allocata.
 */
double **alloc_matrix(int rows, int cols) {
    // Alloca un unico blocco di memoria contiguo per tutti gli elementi
    double *data = (double *)malloc(rows * cols * sizeof(double));
    // Alloca un array di puntatori per le righe
    double **matrix = (double **)malloc(rows * sizeof(double *));
    // Associa ogni puntatore di riga alla posizione corretta nel blocco di dati
    for (int i = 0; i < rows; i++) {
        matrix[i] = &(data[i * cols]);
    }
    return matrix;
}

/**
 * @brief Libera la memoria allocata per una matrice 2D.
 * * @param matrix La matrice da deallocare.
 */
void free_matrix(double **matrix) {
    free(matrix[0]); // Libera il blocco dati contiguo
    free(matrix);    // Libera l'array di puntatori
}


/**************************** MAIN ************************************/

int main(int argc, char *argv[]) {
    // Variabili per la misurazione del tempo
    struct timespec start, end;
    double compute_ms = 0.0;
    double execution_time;

    // Variabili per le dimensioni delle matrici
    int nra, nca, nrb, ncb;

    // Puntatori per le matrici
    double **a, **b, **c;

    // 1. Controlla il numero di argomenti dalla riga di comando
    if (argc < 4) {
        fprintf(stderr, "Uso: %s <file_matrice_A> <file_matrice_B> <file_output_C>\n", argv[0]);
        return 1; // Esce con un codice di errore
    }

    // --- 2. Lettura Matrice A ---
    FILE *file_a = fopen(argv[1], "r");
    if (file_a == NULL) {
        fprintf(stderr, "Errore: impossibile aprire il file %s\n", argv[1]);
        return 1;
    }
    fscanf(file_a, "%d %d", &nra, &nca);
    a = alloc_matrix(nra, nca);
    for (int i = 0; i < nra; i++) {
        for (int j = 0; j < nca; j++) {
            fscanf(file_a, "%lf", &a[i][j]);
        }
    }
    fclose(file_a);

    // --- 3. Lettura Matrice B ---
    FILE *file_b = fopen(argv[2], "r");
    if (file_b == NULL) {
        fprintf(stderr, "Errore: impossibile aprire il file %s\n", argv[2]);
        return 1;
    }
    fscanf(file_b, "%d %d", &nrb, &ncb);
    // Controlla la compatibilità delle dimensioni per la moltiplicazione
    if (nrb != nca) {
        fprintf(stderr, "Errore: Le dimensioni delle matrici non sono compatibili (colonne di A != righe di B).\n");
        return 1;
    }
    b = alloc_matrix(nrb, ncb);
    for (int i = 0; i < nrb; i++) {
        for (int j = 0; j < ncb; j++) {
            fscanf(file_b, "%lf", &b[i][j]);
        }
    }
    fclose(file_b);

    // --- 4. Calcolo della Matrice C ---
    c = alloc_matrix(nra, ncb);

    // Avvia il cronometro
    if (timespec_get(&start, TIME_UTC) != TIME_UTC) {
        fprintf(stderr, "Errore: timespec_get (start) fallita\n");
        return 1;
    }

    // Esegui la moltiplicazione
    for (int i = 0; i < nra; i++) {       // Scorre le righe di A (e di C)
        for (int j = 0; j < ncb; j++) {   // Scorre le colonne di B (e di C)
            c[i][j] = 0.0;
            for (int k = 0; k < nca; k++) { // Scorre la dimensione comune
                c[i][j] = c[i][j] + a[i][k] * b[k][j];
            }
        }
    }

    // Ferma il cronometro
    if (timespec_get(&end, TIME_UTC) != TIME_UTC) {
        fprintf(stderr, "Errore: timespec_get (end) fallita\n");
        return 1;
    }

    // Calcola e stampa la durata
    compute_ms = (end.tv_sec - start.tv_sec) * 1000.0 + (end.tv_nsec - start.tv_nsec) / 1e6;

    // stampo riga chiave da far leggere a nodes
    printf("COMPUTE_MS=%.6f\n", compute_ms);
    fflush(stdout);

    // --- 5. Scrittura della Matrice C su file ---
    FILE *file_c = fopen(argv[3], "w");
    if (file_c == NULL) {
        fprintf(stderr, "Errore: impossibile creare il file di output %s\n", argv[3]);
        return 1;
    }
    // Scrivi le dimensioni
    fprintf(file_c, "%d %d\n", nra, ncb);
    // Scrivi gli elementi
    for (int i = 0; i < nra; i++) {
        for (int j = 0; j < ncb; j++) {
            fprintf(file_c, "%6.2f ", c[i][j]);
        }
        fprintf(file_c, "\n");
    }
    fclose(file_c);

    // --- 6. Liberazione della memoria ---
    free_matrix(a);
    free_matrix(b);
    free_matrix(c);

    return 0; // Il programma termina con successo
}
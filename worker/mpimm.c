#include "mpi.h"
#include <stdio.h>
#include <stdlib.h> // Aggiunto per exit()

#define MASTER 0 /* taskid del primo task */
#define FROM_MASTER 1 /* tipo di messaggio */
#define FROM_WORKER 2 /* tipo di messaggio */

// Funzione per allocare matrice 2d di rows
double **alloc_matrix(int rows, int cols){
    double *data = (double *)malloc(rows * cols * sizeof(double));
    double **matrix = (double **)malloc(rows * sizeof(double *));
    // riempio la matrice
    for (int i = 0; i < rows; i++){
        matrix[i] = &(data[i * cols]);
    }
    return matrix;
}

// funzioen per liberare la memoria
void free_matrix(double **matrix){
    free(matrix[0]);
    free(matrix);
}

int main(int argc, char *argv[]) // Firma di main standard
{
    int nra,
        nca,
        ncb,
        numtasks,
        taskid,
        numworkers,
        source,
        dest,
        mtype,
        rows,
        averow, extra, offset,
        i, j, k;

    double **a, **b, **c;

    MPI_Status status;
    MPI_Init(&argc, &argv);
    MPI_Comm_size(MPI_COMM_WORLD, &numtasks);
    MPI_Comm_rank(MPI_COMM_WORLD, &taskid);

    if (numtasks < 2 ) {
        printf("Errore: servono almeno 2 processi MPI.\n");
        MPI_Abort(MPI_COMM_WORLD, 1);
        exit(1);
    }

    numworkers = numtasks - 1;

    /**************************** master task ************************************/
    if (taskid == MASTER)
    {
        printf("MPI Matrix Multiply con %d processi.\n", numtasks);
        
        // --- INIZIO SEZIONE MODIFICATA ---
        if (argc < 4) {
            printf("Uso: mpirun -n <processi> %s <file_matrice_A> <file_matrice_B>\n", argv[0]);
            MPI_Abort(MPI_COMM_WORLD, 1);
            exit(1);
        }

        // Leggi matrice A dal file
        FILE *file_a = fopen(argv[1], "r");
        if (file_a == NULL) {
            printf("Errore: impossibile aprire il file %s\n", argv[1]);
            MPI_Abort(MPI_COMM_WORLD, 1);
            exit(1);
        }
        fscanf(file_a, "%d %d", &nra, &nca);
        a = alloc_matrix(nra, nca); //alloco lo spazio per la matrice
        // riempio la matrice con i dati del file
        printf("Leggendo matrice A da %s...\n", argv[1]);
        for (i = 0; i < nra; i++)
            for (j = 0; j < nca; j++)
                fscanf(file_a, "%lf", &a[i][j]);
        fclose(file_a);

        // Leggi matrice B dal file
        FILE *file_b = fopen(argv[2], "r");
        if (file_b == NULL) {
            printf("Errore: impossibile aprire il file %s\n", argv[2]);
            MPI_Abort(MPI_COMM_WORLD, 1);
            exit(1);
        }
        int nca_b_temp;
        fscanf(file_b, "%d %d", &nca_b_temp, &ncb);
        if (nca_b_temp != nca){ //colonne a = righe b
            printf("Errore: nca e nca_b_temp diversi\n");
            MPI_Abort(MPI_COMM_WORLD, 1);
            exit(1);
        }
        nca = nca_b_temp;

        b = alloc_matrix(nca, ncb); //alloco spazio per b
        // riempio la matrice b con i dati del file
        printf("Leggendo matrice B da %s...\n", argv[2]);
        for (i = 0; i < nca; i++)
            for (j = 0; j < ncb; j++)
                fscanf(file_b, "%lf", &b[i][j]);
        fclose(file_b);
        
        // --- FINE SEZIONE MODIFICATA ---

        /* Invia i dati ai worker */
        averow = nra / numworkers;
        extra = nra % numworkers;
        offset = 0;
        mtype = FROM_MASTER;
        for (dest = 1; dest <= numworkers; dest++)
        {
            rows = (dest <= extra) ? averow + 1 : averow;
            printf("Inviando %d righe al processo %d\n", rows, dest);
            MPI_Send(&offset, 1, MPI_INT, dest, mtype, MPI_COMM_WORLD);
            MPI_Send(&rows, 1, MPI_INT, dest, mtype, MPI_COMM_WORLD);
            MPI_Send(&nca, 1, MPI_INT, dest, mtype, MPI_COMM_WORLD);
            MPI_Send(&ncb, 1, MPI_INT, dest, mtype, MPI_COMM_WORLD);
            MPI_Send(&a[offset][0], rows * nca, MPI_DOUBLE, dest, mtype, MPI_COMM_WORLD);
            MPI_Send(&b[0][0], nca * ncb, MPI_DOUBLE, dest, mtype, MPI_COMM_WORLD);
            offset = offset + rows;
        }

        // allocazione matrice di output
        c = alloc_matrix(nra, ncb);
        /* Ricevi i risultati dai worker */
        mtype = FROM_WORKER;
        for (i = 1; i <= numworkers; i++)
        {
            source = i;
            MPI_Recv(&offset, 1, MPI_INT, source, mtype, MPI_COMM_WORLD, &status);
            MPI_Recv(&rows, 1, MPI_INT, source, mtype, MPI_COMM_WORLD, &status);
            MPI_Recv(&c[offset][0], rows * ncb, MPI_DOUBLE, source, mtype, MPI_COMM_WORLD, &status);
        }

        // apertura del file di output
        FILE *file_output = fopen(argv[3], "w");
        if (file_output == NULL){
            printf("Errore: impossibile aprire il file %s\n", argv[3]);
            MPI_Abort(MPI_COMM_WORLD, 1);
            exit(1);
        }
        printf("\n--- Matrice Risultato ---\n");
        fprintf(file_output,"%d %d\n", nra, ncb);
        for (i = 0; i < nra; i++)
        {
            for (j = 0; j < ncb; j++)
                fprintf(file_output, "%6.2f ", c[i][j]);
            fprintf(file_output, "\n");
        }
        fclose(file_output);
        printf("-------------------------\n");

        free_matrix(a);
        free_matrix(b);
        free_matrix(c);
    }

    /**************************** worker task ************************************/
    if (taskid > MASTER)
    {
        mtype = FROM_MASTER;
        MPI_Recv(&offset, 1, MPI_INT, MASTER, mtype, MPI_COMM_WORLD, &status);
        MPI_Recv(&rows, 1, MPI_INT, MASTER, mtype, MPI_COMM_WORLD, &status);
        MPI_Recv(&nca, 1, MPI_INT, MASTER, mtype, MPI_COMM_WORLD, &status);
        MPI_Recv(&ncb, 1, MPI_INT, MASTER, mtype, MPI_COMM_WORLD, &status);

        // allocazione memoria matrici
        a = alloc_matrix(rows, nca);
        b = alloc_matrix(nca, ncb);
        c = alloc_matrix(rows, ncb);

        MPI_Recv(a[0], rows * nca, MPI_DOUBLE, MASTER, mtype, MPI_COMM_WORLD, &status);
        MPI_Recv(b[0], nca * ncb, MPI_DOUBLE, MASTER, mtype, MPI_COMM_WORLD, &status);

        for (k = 0; k < ncb; k++)
            for (i = 0; i < rows; i++){
                c[i][k] = 0.0;
                for (j = 0; j < nca; j++)
                    c[i][k] = c[i][k] + a[i][j] * b[j][k];
            }
        
        mtype = FROM_WORKER;
        MPI_Send(&offset, 1, MPI_INT, MASTER, mtype, MPI_COMM_WORLD);
        MPI_Send(&rows, 1, MPI_INT, MASTER, mtype, MPI_COMM_WORLD);
        MPI_Send(c[0], rows * ncb, MPI_DOUBLE, MASTER, mtype, MPI_COMM_WORLD);
   
        // libero la memoria
        free_matrix(a);
        free_matrix(b);
        free_matrix(c);
    }
    MPI_Finalize();
    return 0;
}
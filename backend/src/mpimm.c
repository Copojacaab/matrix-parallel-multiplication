#include "mpi.h"
#include <stdio.h>
#define NRA 62
/* number of rows in matrix A */
#define NCA 15
/* number of columns in matrix A */
#define NCB 7
/* number of columns in matrix B */
#define MASTER 0
/* taskid of first task */
#define FROM_MASTER 1
/* setting a message type */
#define FROM_WORKER 2
/* setting a message type */
// ./mpimm_exec file_A.txt file_B.txt file_result.txt
int main(argc, argv)
int argc;
char *argv[];
{
    int
        numtasks,
        /* number of tasks in partition */
        taskid,
        /* a task identifier */
        numworkers,
        /* number of worker tasks */
        source,
        /* task id of message source */
        dest,
        /* task id of message destination */
        mtype,
        /* message type */
        rows,
        /* rows of  Documentazione del progetto
## Spiegazione delle Sceltmatrix A sent to each worker */
        averow, extra, offset, /* used to determine rows sent to each worker */
        i, j, k, rc;
    /* misc */
    double a[NRA][NCA],
        /* matrix A to be multiplied */
        b[NCA][NCB],
        /* matrix B to be multiplied */
        c[NRA][NCB];
    /* result matrix C */
    MPI_Status status;
    rc = MPI_Init(&argc, &argv);
    rc |= MPI_Comm_size(MPI_COMM_WORLD, &numtasks);
    rc |= MPI_Comm_rank(MPI_COMM_WORLD, &taskid);
    if (rc != 0)
        printf("error initializing MPI and obtaining task ID information\n");
    else
        printf("task ID = %d\n", taskid);
    numworkers = numtasks - 1;
    /**************************** master task ************************************/
    if (taskid == MASTER)
    {
        printf("Number of worker tasks = %d\n", numworkers);
        for (i = 0; i < NRA; i++)
            for (j = 0; j < NCA; j++)
                a[i][j] = i + j;
        for (i = 0; i < NCA; i++)
            for (j = 0; j < NCB; j++)
                b[i][j] = i * j;
        /* send matrix data to the worker tasks */
        averow = NRA / numworkers;
        extra = NRA % numworkers;
        offset = 0;
        mtype = FROM_MASTER;
        for (dest = 1; dest <= numworkers; dest++)
        {
            rows = (dest <= extra) ? averow + 1 : averow;
            printf(" sending %d rows to task %d\n", rows, dest);
            MPI_Send(&offset, 1, MPI_INT, dest, mtype, MPI_COMM_WORLD);
            MPI_Send(&rows, 1, MPI_INT, dest, mtype, MPI_COMM_WORLD);
            MPI_Send(&a[offset][0], rows * NCA, MPI_DOUBLE, dest, mtype,
                     MPI_COMM_WORLD);
            MPI_Send(&b, NCA * NCB, MPI_DOUBLE, dest, mtype, MPI_COMM_WORLD);
            offset = offset + rows;
        }
        /* wait for results from all worker tasks */
        mtype = FROM_WORKER;
        for (i = 1; i <= numworkers; i++)
        {
            source = i;
            MPI_Recv(&offset, 1, MPI_INT, source, mtype, MPI_COMM_WORLD, &status);
            MPI_Recv(&rows, 1, MPI_INT, source, mtype, MPI_COMM_WORLD, &status);
            MPI_Recv(&c[offset][0], rows * NCB, MPI_DOUBLE, source, mtype,
                     MPI_COMM_WORLD, &status);
        }
        /* print results */
        printf("Here is the result matrix\n");
        for (i = 0; i < NRA; i++)
        {
            printf("\n");
            for (j = 0; j < NCB; j++)
                printf("%6.2f ", c[i][j]);
        }
        printf("\n");
    }
    /**************************** worker task ************************************/
    if (taskid > MASTER)
    {
        mtype = FROM_MASTER;
        MPI_Recv(&offset, 1, MPI_INT, MASTER, mtype, MPI_COMM_WORLD, &status);
        MPI_Recv(&rows, 1, MPI_INT, MASTER, mtype, MPI_COMM_WORLD, &status);
        MPI_Recv(&a, rows * NCA, MPI_DOUBLE, MASTER, mtype, MPI_COMM_WORLD,
                 &status);
        MPI_Recv(&b, NCA * NCB, MPI_DOUBLE, MASTER, mtype, MPI_COMM_WORLD,
                 &status);
        for (k = 0; k < NCB; k++)
            for (i = 0; i < rows; i++)
            {
                c[i][k] = 0.0;
                for (j = 0; j < NCA; j++)
                    c[i][k] = c[i][k] + a[i][j] * b[j][k];
            }
        mtype = FROM_WORKER;
        MPI_Send(&offset, 1, MPI_INT, MASTER, mtype, MPI_COMM_WORLD);
        MPI_Send(&rows, 1, MPI_INT, MASTER, mtype, MPI_COMM_WORLD);
        MPI_Send(&c, rows * NCB, MPI_DOUBLE, MASTER, mtype, MPI_COMM_WORLD);
    }
    MPI_Finalize();
}
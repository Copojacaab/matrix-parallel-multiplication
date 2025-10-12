// __tests__/job_repository.test.js
const { updateJobRunning } = require('../job_repository');
const { updateJobSuccess } = require('../job_repository');
const { updateJobFailure } = require('../job_repository');
const { createQueuedJob, getJob, clearJobs } = require('./utils');

// Pulizia a fine di OGNI test: niente interferenze cross-test
afterEach(async () => {
  await clearJobs();
});

describe('createJob', () => {
  test("salva un record 'queued' con i campi base popolati", async () => {
    // Arrange
    const { jobId, nra, nca, ncb, matrixA, matrixB } = await createQueuedJob();

    // Act: (già fatto in createQueuedJob)

    // Assert
    const row = await getJob(jobId);

    expect(row).toBeTruthy();
    expect(row.id).toBe(jobId);

    // Contratto iniziale
    expect(row.status).toBe('queued'); // createJob inserisce 'queued' e ISO date
    expect(typeof row.created_at).toBe('string');
    expect(row.created_at.length).toBeGreaterThan(0);

    // Valori null all'inizio
    expect(row.completed_at).toBeNull();
    expect(row.execution_time_ms).toBeNull();

    // Parametri
    expect(row.nra).toBe(nra);
    expect(row.nca).toBe(nca);
    expect(row.ncb).toBe(ncb);

    // Matrici come passate in input
    expect(row.matrix_a).toBe(matrixA);
    expect(row.matrix_b).toBe(matrixB);
  });
});

describe('updateJobRunning', () => {
  let jobId;
  let createdAt0;

  beforeEach(async () => {
    // Ogni test di questo blocco parte da un job 'queued'
    const job = await createQueuedJob();
    jobId = job.jobId;
    const rowBefore = await getJob(jobId);
    createdAt0 = rowBefore.created_at;
  });

  test("aggiorna correttamente lo stato a 'running' mantenendo created_at", async () => {
    // Act
    await updateJobRunning(jobId);

    // Assert
    const rowAfter = await getJob(jobId);

    expect(rowAfter.status).toBe('running');
    expect(rowAfter.created_at).toBe(createdAt0); // non deve cambiare
    expect(rowAfter.completed_at).toBeNull();
    expect(rowAfter.execution_time_ms).toBeNull();
  });

  test("test di idempotenza, due chiamate a updateRunning valori devono rimanere gli stessi", async() =>{
    await updateJobRunning(jobId);
    const rowBeforRunning = await getJob(jobId);
    const createdAt1 = rowBeforRunning.created_at;

    // act
    await updateJobRunning(jobId);
    
    // assert
    const rowAfter = await getJob(jobId);

    expect(rowAfter.status).toBe('running');
    expect(rowAfter.created_at).toBe(createdAt1); // non deve cambiare
    expect(rowAfter.completed_at).toBeNull();
    expect(rowAfter.execution_time_ms).toBeNull();
  });
});

describe('updateJobSuccess', () => {
    let jobId;
    let createdAt0;

    beforeEach(async() => {
        const job = await createQueuedJob();
        jobId = job.jobId;

        await updateJobRunning(jobId);
        const rowBefore = await getJob(jobId);
        createdAt0 = rowBefore.created_at;


    });

    const resultC = JSON.stringify([[4,4], [4,4]]);
    const execMs = 123;
    const completedAt = new Date().toISOString();

    test("aggiorna lo stato a running, valorizza completed_at, imposta execution_time_mse e salva result_c", async() => {
        // act
        await updateJobSuccess(jobId, resultC, completedAt, execMs);

        // assert
        const rowAfter = await getJob(jobId);

        expect(rowAfter.status).toBe('completed');
        expect(rowAfter.completed_at).toBe(completedAt);
        expect(rowAfter.execution_time_ms).toBe(execMs);
        expect(rowAfter.result_c).toBe(resultC);

        expect(rowAfter.created_at).toBe(createdAt0)
    });

    test("test di idempotenza, due chiamate a updateRunning valori devono rimanere gli stessi", async() =>{
      await updateJobSuccess(jobId);
      const rowBeforSuccess = await getJob(jobId);
      const createdAt2 = rowBeforSuccess.created_at;
      const completedAt2 = rowBeforSuccess.completed_at;

      // act
      await updateJobSuccess(jobId);
      
      // assert
      const rowAfter = await getJob(jobId);

      expect(rowAfter.status).toBe('completed');
      expect(rowAfter.created_at).toBe(createdAt2); // non deve cambiare
      expect(rowAfter.completed_at).toBe(completedAt2); //non deve cambiare
      expect(rowAfter.execution_time_ms).toBeNull();
    });
});

describe('updateJobFailure', () => {
    let jobId;
    let createdAt0;

    beforeEach(async() => {
        const job = await createQueuedJob();
        jobId = job.jobId;

        await updateJobRunning(jobId);
        const rowBefore = await getJob(jobId);
        createdAt0 = rowBefore.created_at;
    });

    const execMs = 123;
    const completedAt = new Date().toISOString();

    test("aggiorna lo stato a 'failed', valorizza completed_at e execution time", async() => {
        // act 
        await updateJobFailure(jobId, completedAt, execMs);

        // assert
        const rowAfter = await getJob(jobId);

        expect(rowAfter.status).toBe('failed');
        expect(rowAfter.completed_at).toBe(completedAt);
        expect(rowAfter.execution_time_ms).toBe(execMs);
    });
});
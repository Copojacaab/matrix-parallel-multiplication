const request = require('supertest');
const fs = require('fs');


// MOCK DEL FILESYSTEM
jest.mock('fs');
// MOCK DI EXEC
jest.mock('child_process', () => ({
    exec: jest.fn()
}));
const { exec } = require('child_process');
// MOCK FUNZIONI DB
jest.mock('../../database/job_repository', () => ({
    createJob: jest.fn(),
    updateJobFailure: jest.fn(),
}));

// repo per validazione chiamate db
const repo = require('../../database/job_repository');
const Test = require('supertest/lib/test');
const { type } = require('os');

// CLEANUP
beforeEach(() => {
    jest.clearAllMocks();
})
const origLog = console.log;
beforeAll(() => (console.log = jest.fn()));
afterAll(() => (console.log = origLog));

// importo app dopo i mock
let app;
beforeAll(() => {
    app = require('../index')
});

// TEST_1: Fase di VALIDAZIONE
test('400 se manca matrixA o B', async() => {
    await request(app).post('/api/jobs').send({}).expect(400);
    await request(app).post('/api/jobs').send({ matrixA: [[1]] }).expect(400);
    await request(app).post('/api/jobs').send({ matrixB: [[1]] }).expect(400);
});

test('400 se dimensioni matrici non compatibili', async() => {
    const body = { matrixA: [[1,2]], matrixB: [[3,4]] }; //1x2 * 1x2 non compatibili
    await request(app).post('/api/jobs').send(body).expect(400);
});

test('400 se elementi non numerici o righe irregolari', async () => {
  await request(app).post('/api/jobs')
    .send({ matrixA: [[1, 'x']], matrixB: [[1],[1]] })
    .expect(400);
  await request(app).post('/api/jobs')
    .send({ matrixA: [[1],[2,3]], matrixB: [[1]] })
    .expect(400);
});


// TEST_2: CREATE JOB + err I/O
test('createJob viene chiamato con le dimensioni corrette', async() => {
    // mock di scrittura file a e b
    fs.writeFile.mockImplementation((path, data, cb) => cb(new Error('104 moment')));

    const A = [[1,2], [3,4]];
    const B = [[5,6], [7,8]];
    await request(app).post('/api/jobs').send({ matrixA: A, matrixB: B }).expect(500); 

    // chek che il db sia stato chiamato solo una volta
    expect(repo.createJob).toHaveBeenCalledTimes(1);
    const [jobId, nra, nca, ncb, dataA, dataB] = repo.createJob.mock.calls[0];
    expect(nra).toBe(2);
    expect(nca).toBe(2);
    expect(ncb).toBe(2);
    expect(dataA).toContain('2 2'); //dimensioni mat in cima al file
    expect(dataB).toContain('2 2');
});

test('writeFileA fallisce --> 500 e call updateJobFailure', async() => {
    // simulo fallimento scrittura file A
    fs.writeFile.mockImplementation((p,d,cb) => cb(new Error('104 moment')));

    await request(app)
        .post('/api/jobs').send({ matrixA: [[1]], matrixB: [[1]] })
        .expect(500);
    
    // check chiamata a failure
    expect(repo.updateJobFailure).toHaveBeenCalledTimes(1);
    const [jobId, completedAt, execMs] = repo.updateJobFailure.mock.calls[0];
    expect(typeof(jobId)).toBe('string');
    expect(typeof(completedAt)).toBe('string');
    expect(execMs).toBe(0);
});

test('writeFileB fallisce --> 500 e call a updateJobFailure', async() => {
    fs.writeFile
        .mockImplementationOnce((p,d,cb) => cb(null))
        .mockImplementationOnce((p,d,cb) => cb(new Error('104 moment')));

    await request(app)
        .post('/api/jobs').send({ matrixA: [[1]], matrixB: [[1]] })
        .expect(500);
    
    // chech chiamata failure
    expect(repo.updateJobFailure).toHaveBeenCalledTimes(1);
    const [jobId, completedAt, execMs] = repo.updateJobFailure.mock.calls[0];
    expect(typeof(jobId)).toBe('string');
    expect(typeof(completedAt)).toBe('string');
    expect(execMs).toBe(0);
});



// TEST 3: err WORKER / err READ C
test('exec fallisce --> 500', async() => {
    // simulo scrittura input no errori
    fs.writeFile.mockImplementation((p,d,cb) => cb(null));
    // simulo errore in worker
    exec.mockImplementation((cmd, opts, cb) => cb(new Error('104 moment')));

    // assert
    await request(app)
        .post('/api/jobs')
        .send({ matrixA: [[1]], matrixB: [[1]] })
        .expect(500);
});

test('readFile C fallisce --> 500', async() => {
    fs.writeFile.mockImplementation((p,d,cb) => cb(null)); //scrittura ok
    exec.mockImplementation((cmd, opts, cb) => cb(null, 'ok', '')); //worker ok
    // act
    fs.readFile.mockImplementation((p, enc, cb) => cb(new Error('104 moment')));

    // assert
    await request(app)
        .post('/api/jobs')
        .send({ matrixA: [[1]], matrixB: [[1]] })
        .expect(500);
});

// TEST 4: happy path
test('procedimento ok --> 200 con {message, jobId, result} e unlink chiamati', async() => {
    fs.writeFile.mockImplementation((p,d,cb) => cb(null));
    exec.mockImplementation((cmd, opts, cb) => cb(null, 'ok', ''));

    // finto file resultC
    const fakeC = `2 2
    3 4 
    5 6`;
    fs.readFile.mockImplementation((p, enc, cb) => cb(null, fakeC)); //lettura C ok restituisco finta matrice

    // traccio unlink
    const unlinkSpy = jest.spyOn(fs, 'unlink').mockImplementation((p,cb) => cb && cb(null));

    // assert
    const res = await request(app)
        .post('/api/jobs')
        .send({ matrixA: [[1,1],[1,1]], matrixB: [[2,2], [2,2]]})
        .expect(200);

    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('jobId');
    expect(res.body).toHaveProperty('result');
    expect(Array.isArray(res.body.result)).toBe(true);
    // cleanup chiamato per ogni matrice
    expect(unlinkSpy).toHaveBeenCalledTimes(3);
    unlinkSpy.mockRestore();
});

/** Obbiettivo del test:
 * - POST /api/jobs risponde 202 con jobid
 * - chiama createJob
 * - chiama il runner in background(mocckato)
 * - GET /api/jobs/:id restituisce lo stato
 */

// ------------------------------------- MOCK ----------------------------------
// 1) mock repo
jest.mock('../../database/job_repository', () => {
    const jobs = new Map();
    return {
        createJob: jest.fn(async (...args) => {
            const [id] = args;
            jobs.set(id, { id, status: 'queued', created_at: new Date().toISOString() });
        }),
        getJobById: jest.fn(async (id) => jobs.get(id) || null),
        updateJobRunning: jest.fn(async (id) => {
            const jid = jobs.get(id);
            if(jid)
                jid.status = 'running';
        }),
        updateJobSuccess: jest.fn(async (id, result_c) => {
            const jid = jobs.get(id);
            if(jid){
                jid.status = 'completed';
                jid.result_c = result_c
            };
        }),
        updateJobFailure: jest.fn(async (id, error) => {
            const jid = jobs.get(id);
            if(jid){
                jid.status = 'failed';
                jid.error = String(error);
            };
        })
    };
});

// 2) mock del runner
jest.mock('../runner', () => ({
    start: jest.fn(() => Promise.resolve()),
}));

// 3) jobId stabile
jest.spyOn(require('crypto'), 'randomBytes')
  .mockReturnValue({ toString: () => 'fixedid123' });


const request = require('supertest');
const app = require('../index');

describe('API async flow', () => {
    test('POST /api/jobs -> 202 + jobId con chiamata a runner.start', async() => {
        const res = await request(app)
            .post('/api/jobs')
            .send({
                nra: 3, nca: 3, ncb: 3,
                matrixA: [[1,2,3],[4,5,6],[7,8,9]],
                matrixB: [[9,8,7],[6,5,4],[3,2,1]]
            });
        
        // assert
        expect(res.status).toBe(202); // risposta immediata
        expect(res.body).toEqual({ jobId: 'fixedid123' });

        const repo = require('../../database/job_repository');
        expect(repo.createJob).toHaveBeenCalledTimes(1);
        expect(repo.createJob).toHaveBeenCalledWith(
            'fixedid123',
            expect.any(Number), //ra
            expect.any(Number), //ca
            expect.any(Number), //cb
            expect.any(String), // matA
            expect.any(String) // matB
        );

        const runner = require('../runner');
        expect(runner.start).toHaveBeenCalledTimes(1);
        expect(runner.start).toHaveBeenCalledWith(
        'fixedid123',
        expect.objectContaining({
            rowsA: expect.any(Number),
            colsA: expect.any(Number),
            colsB: expect.any(Number),
            matrixA: expect.any(Array),
            matrixB: expect.any(Array),
            })
        );
    });

    test('GET /api/jobs/:id --> 200 con lo stato del job', async() => {
        const res = await request(app)
            .post('/api/jobs')
            .send({
                nra: 3, nca: 3, ncb: 3,
                matrixA: [[1,2,3],[4,5,6],[7,8,9]],
                matrixB: [[9,8,7],[6,5,4],[3,2,1]]
            });
        
        // assert
        expect(res.status).toBe(202);
        expect(res.body).toEqual({ jobId: 'fixedid123' });

        // ora interrogo lo stato
        const getRes = await request(app).get('/api/jobs/fixedid123');
        expect(getRes.status).toBe(200);
        expect(getRes.body.id).toBe('fixedid123');
        expect(['queued', 'running', 'completed', 'failed']).toContain(getRes.body.status);
    });
});
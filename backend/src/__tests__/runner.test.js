/** OBBIETTIVI TEST:
 * - verifica che il runner aggiorni a runnig lo stato
 * - verificare che scriva i file A e B
 * - verificare che invochi mpirun con i 3 fil
 * - veriricare che allega C alla fine e chiama jobSuccess
 */

const path = require('path');

// mock repo fs e exec
jest.mock('../../database/job_repository', () => ({
    updateJobRunning: jest.fn(async () => {}),
    updateJobSuccess: jest.fn(async () => {}),
    updateJobFailure: jest.fn(async () => {}),
}));

jest.mock('fs', () => ({
    promises: {
        writeFile: jest.fn(async () => {}),
        readFile: jest.fn(async () => '3 3\n1 2 3\n4 5 6\n7 8 9\n'),
        unlink: jest.fn(async () => {}),
    },
}));

jest.mock('child_process', () => ({
  exec: jest.fn((cmd, opts, cb) => cb(null, 'OK', '')),
}));

// import

const { updateJobRunning, updateJobSuccess, updateJobFailure } = require('../../database/job_repository');
const { exec } = require('child_process');
const fs = require('fs');

const runner = require('../runner');

describe('runner.start (happy path minimo', () => {
    test('running --> exec mpirun --> success', async() => {
        const jobId = 'job123';
        const payload = {
            rowsA: 3, colsA: 3, colsB: 3,
            matrixA: [[1,2,3],[4,5,6],[7,8,9]],
            matrixB: [[9,8,7],[6,5,4],[3,2,1]],
        };

        await runner.start(jobId, payload);

        // assert
        expect(updateJobRunning).toHaveBeenCalledWith(jobId);

        expect(fs.promises.writeFile).toHaveBeenCalledTimes(2);

        // mpirun invocato con 3 file
        const call = exec.mock.calls[0][0];
        expect(call).toMatch(/mpirun/);
        expect(call).toMatch(/mpimm_exec/);
        expect(call).toMatch(new RegExp(`matrice_a_${jobId}\\.txt`));
        expect(call).toMatch(new RegExp(`matrice_b_${jobId}\\.txt`));

        // lettura c e success
        expect(fs.promises.readFile).toHaveBeenCalledTimes(1);
        expect(updateJobSuccess).toHaveBeenCalledTimes(1);
        expect(updateJobFailure).not.toHaveBeenCalled();
    });
});
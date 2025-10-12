// __tests__/jobs_api_flow_test.js

// ---------------------------------------------------------------------
// MOCK PRINCIPALI
// ----------------------------------------------------------------------
// mock del child process
jest.mock('child_process', () => ({
    exec: jest.fn((cmd, cb) => {
        exec: jest.fn()
    })
}));

// mock del repository
jest.mock('../../database/job_repository', () => ({
    createJob: jest.fn(),
    updateJobRunning: jest.fn(),
    updateJobFailure: jest.fn(),
    updateJobSuccess: jest.fn(),
}));

// ----------------------------------------------------------------------
// IMPORT
// ----------------------------------------------------------------------
const request = require('supertest')
const app = require('../index');
const jobRepository = require('../../database/job_repository');
const { fstat } = require('fs');
const { exec } = require('child_process');

// ------------------------------------------------------------------
// RESET E CLEANUP
// ------------------------------------------------------------------
beforeEach(() => {
    jest.clearAllMocks();
});

afterEach(() => {
    jest.restoreAllMocks();
});

// -----------------------------------------------------------------
// writefile delle matrici di input ok
jest.spyOn(fs, 'writeFile').mockImplementation((path, data, cb) => cb(null)); //ignora path e data, nessun errore (OK)
// readFile C OK (restituisco 2x2
jest.spyOn(fs, 'readFile').mockImplementation((path, enc, cb) => {
    const content = '2 2 /n3 3 /n3 3/n';
    cb(null, content);
});
// exec --> success
exec.mockImplementation((cmd, cb) => cb(null, 'stoud-ok', ''));

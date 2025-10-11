// __tests__/utils.js
const { createJob } = require('../job_repository');
const db = require('../database');

function genJobData(overrides = {}) {
  const base = {
    jobId: 'job-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    nra: 2,
    nca: 2,
    ncb: 2,
    matrixA: JSON.stringify([[1, 1], [1, 1]]),
    matrixB: JSON.stringify([[2, 2], [2, 2]]),
  };
  return { ...base, ...overrides };
}

async function createQueuedJob(overrides = {}) {
  const { jobId, nra, nca, ncb, matrixA, matrixB } = genJobData(overrides);
  await createJob(jobId, nra, nca, ncb, matrixA, matrixB);
  return { jobId, nra, nca, ncb, matrixA, matrixB };
}

function getJob(jobId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM jobs WHERE id = ?', [jobId], (err, row) =>
      err ? reject(err) : resolve(row)
    );
  });
}

function clearJobs() {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM jobs WHERE id LIKE ?', ['job-%'], err =>
      err ? reject(err) : resolve()
    );
  });
}

module.exports = {
  genJobData,
  createQueuedJob,
  getJob,
  clearJobs,
};

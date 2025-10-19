// utils/parseCompute.js (nuovo file piccolo)
function parseComputeMs(stdout = '') {
  // cerca "COMPUTE_MS=<numero>"
  const m = String(stdout).match(/COMPUTE_MS\s*=\s*([0-9]+(?:\.[0-9]+)?)/i);
  return m ? Number(m[1]) : null;
}
module.exports = { parseComputeMs };

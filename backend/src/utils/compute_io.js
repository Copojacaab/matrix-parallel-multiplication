// backend/src/utils/compute_io.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Scrive una matrice in formato testuale per il worker.
 * Formato:
 *   r c
 *   a11 a12 ... a1c
 *   ...
 *   ar1 ... arc
 */
function writeMatrixTxt(filePath, matrix) {
  const rows = matrix.length;
  const cols = matrix[0]?.length || 0;
  const header = `${rows} ${cols}`;
  const lines = matrix.map(row => row.join(' '));
  fs.writeFileSync(filePath, [header, ...lines].join('\n'), 'utf8');
}

/**
 * Legge una matrice dal formato testuale del worker.
 * (Utile se vuoi validare/riusare; per l’output spesso basta parseOutputMatrix)
 */
function readMatrixTxt(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  const [first, ...rest] = raw.split('\n');
  const [r, c] = first.split(/\s+/).map(Number);
  const matrix = rest.map(line => line.trim().split(/\s+/).map(Number));
  if (matrix.length !== r) throw new Error('Righe non coerenti con header');
  matrix.forEach(row => {
    if (row.length !== c) throw new Error('Colonne non coerenti con header');
  });
  return { rows: r, cols: c, matrix };
}

/**
 * Parsea la matrice di output direttamente da stringa (se l’hai già letta).
 */
function parseOutputMatrix(raw) {
  const lines = raw.trim().split('\n');
  const [r, c] = lines[0].split(/\s+/).map(Number);
  const data = lines.slice(1).map(line => line.trim().split(/\s+/).map(Number));
  return { rows: r, cols: c, matrix: data };
}

/**
 * Estrae il tempo di calcolo (ms) dallo stdout del worker.
 * Cerca la forma: COMPUTE_MS=123.45
 */
function parseComputeMs(stdout) {
  const m = String(stdout).match(/COMPUTE_MS\s*=\s*([0-9]+(?:\.[0-9]+)?)/i);
  return m ? Number(m[1]) : null;
}

/**
 * Lancia il binario MPI o seriale.
 * - command: string (es. 'mpirun' o path del binario seriale)
 * - args: string[] (es. ['-np','4','./worker/mpimm','A.txt','B.txt','C.txt'])
 * Ritorna { exitCode, stdout, stderr }
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });

    let out = '';
    let err = '';

    child.stdout.on('data', chunk => { out += chunk.toString(); });
    child.stderr.on('data', chunk => { err += chunk.toString(); });

    child.on('error', reject);
    child.on('close', (code) => resolve({ exitCode: code, stdout: out, stderr: err }));
  });
}

/**
 * Crea (se serve) una cartella temporanea per il job.
 */
function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Elimina in sicurezza un file se esiste.
 */
function safeUnlink(filePath) {
  try { fs.unlinkSync(filePath); } catch (_) {}
}

module.exports = {
  writeMatrixTxt,
  readMatrixTxt,
  parseOutputMatrix,
  parseComputeMs,
  runCommand,
  ensureDir,
  safeUnlink,
};

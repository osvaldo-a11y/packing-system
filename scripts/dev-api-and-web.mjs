/**
 * Arranca Nest (:3000) y Vite (:5173) en el mismo proceso (Ctrl+C corta ambos).
 * Uso: node scripts/dev-api-and-web.mjs
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';

const api = spawn(npm, ['run', 'start:dev'], {
  cwd: root,
  stdio: 'inherit',
  shell: isWin,
  env: process.env,
});
const web = spawn(npm, ['run', 'dev:web'], {
  cwd: root,
  stdio: 'inherit',
  shell: isWin,
  env: process.env,
});

function shutdown(code = 0) {
  api.kill('SIGTERM');
  web.kill('SIGTERM');
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
api.on('exit', (code, signal) => {
  if (signal) shutdown(0);
  else if (code && code !== 0) shutdown(code);
});
web.on('exit', (code, signal) => {
  if (signal) shutdown(0);
  else if (code && code !== 0) shutdown(code);
});

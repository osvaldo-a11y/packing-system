/**
 * Arranca Nest (:3000), Vite (:5173) y el servicio local Zebra (:3001).
 * Uso: node scripts/dev-api-web-zebra.mjs   |   npm run dev:full:print
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';
const printScript = path.join(root, 'local-zebra-print-service', 'print-server.js');

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
const zebra = spawn(process.execPath, [printScript], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

function shutdown(code = 0) {
  api.kill('SIGTERM');
  web.kill('SIGTERM');
  zebra.kill('SIGTERM');
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
function onChildExit() {
  return (code, signal) => {
    if (signal) shutdown(0);
    else if (code && code !== 0) shutdown(code ?? 1);
  };
}
api.on('exit', onChildExit());
web.on('exit', onChildExit());
zebra.on('exit', onChildExit());

/* eslint-disable @typescript-eslint/no-require */
/**
 * Reinicia datos operativos del sandbox vía API (POST /api/demo/reset) y vuelve a sembrar maestros demo.
 *
 *   API_BASE=https://tu-demo.up.railway.app npm run demo:reset
 *
 * Requiere DEMO_SANDBOX=true en el servidor y usuario admin.
 */
require('dotenv').config();

const { spawnSync } = require('child_process');
const path = require('path');

const API_BASE = (process.env.API_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');

async function main() {
  const user = process.env.DEMO_SEED_USER || 'admin';
  const pass = process.env.DEMO_SEED_PASS || 'admin123';

  const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
  });
  if (!loginRes.ok) {
    throw new Error(`Login falló: ${loginRes.status} ${await loginRes.text()}`);
  }
  const { access_token } = await loginRes.json();

  const resetRes = await fetch(`${API_BASE}/api/demo/reset`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
  });
  if (!resetRes.ok) {
    throw new Error(`Reset falló: ${resetRes.status} ${await resetRes.text()}`);
  }
  console.log('OK: datos operativos del sandbox limpiados.');

  const seed = spawnSync(process.execPath, [path.join(__dirname, 'seed-demo-sandbox.cjs')], {
    stdio: 'inherit',
    env: process.env,
  });
  if (seed.status !== 0) process.exit(seed.status || 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

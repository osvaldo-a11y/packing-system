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
const { assertNotProductionApi } = require('./demo-safety.cjs');

const API_BASE = (process.env.API_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');

async function main() {
  assertNotProductionApi(API_BASE);
  const healthRes = await fetch(`${API_BASE}/api/auth/health`, { headers: { Accept: 'application/json' } });
  const health = await healthRes.json().catch(() => ({}));
  if (health?.demo_sandbox !== true) {
    throw new Error('ABORT: reset solo contra un API con demo_sandbox=true.');
  }

  const creds = [
    [process.env.DEMO_SEED_USER, process.env.DEMO_SEED_PASS],
    ['admin', 'admin123'],
    [process.env.DEMO_USERNAME || 'admin.demo', process.env.DEMO_PASSWORD || 'demo123'],
    ['demo', 'demo123'],
  ].filter((p, i, arr) => p[0] && p[1] && arr.findIndex((q) => q[0] === p[0] && q[1] === p[1]) === i);

  let access_token;
  const errors = [];
  for (const [user, pass] of creds) {
    const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username: user, password: pass }),
    });
    if (loginRes.ok) {
      access_token = (await loginRes.json()).access_token;
      break;
    }
    errors.push(`${user}: ${loginRes.status} ${await loginRes.text()}`);
  }
  if (!access_token) {
    throw new Error(`Login falló:\n${errors.join('\n')}`);
  }

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

/**
 * Piloto Final Charge — POST local o Railway.
 *
 * Uso:
 *   node scripts/import-final-charge-pilot.cjs 2025 data/import/FINAL_CHARGE-SEASON_2025.xlsx
 *
 * Variables (.env):
 *   API_BASE_URL  default http://localhost:3000
 *   ADMIN_USER / ADMIN_PASS  default admin / osaez789
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');

const year = Number(process.argv[2] || 2025);
const fileArg = process.argv[3] || 'data/import/FINAL_CHARGE-SEASON_2025.xlsx';
const filePath = path.isAbsolute(fileArg) ? fileArg : path.join(__dirname, '..', fileArg);
const baseUrl = (process.env.API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const user = process.env.ADMIN_USER || 'admin';
const pass = process.env.ADMIN_PASS || 'osaez789';

async function login() {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
  });
  if (!res.ok) {
    throw new Error(`Login failed (${res.status}): ${await res.text()}`);
  }
  const body = await res.json();
  const token = body.access_token || body.accessToken;
  if (!token) throw new Error('No access_token in login response');
  return token;
}

async function importFile(token) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Archivo no encontrado: ${filePath}`);
    console.error('   Coloque FINAL_CHARGE-SEASON_2025.xlsx en data/import/');
    process.exit(1);
  }
  const buffer = fs.readFileSync(filePath);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const form = new FormData();
  form.append('file', blob, path.basename(filePath));

  const res = await fetch(`${baseUrl}/api/seasons/${year}/import/final-charge`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Import failed (${res.status}): ${text.slice(0, 500)}`);
  }
  if (!res.ok) {
    throw new Error(`Import failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

(async () => {
  console.log(`→ Login ${baseUrl} as ${user}`);
  const token = await login();
  console.log(`→ Import ${filePath} → season ${year}`);
  const result = await importFile(token);
  console.log(JSON.stringify(result, null, 2));
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

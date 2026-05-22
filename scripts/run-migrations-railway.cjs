/**
 * Migraciones contra Postgres de Railway (usa RAILWAY_URL del .env).
 * Requiere: npm run build (migraciones en dist/).
 */
require('dotenv').config();
const { spawnSync } = require('child_process');
const path = require('path');

const url = process.env.RAILWAY_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('❌ Definí RAILWAY_URL (o DATABASE_URL) en .env');
  process.exit(1);
}

process.env.DATABASE_URL = url;
process.env.NODE_ENV = 'production';

const root = path.join(__dirname, '..');
const result = spawnSync(process.execPath, [path.join(__dirname, 'run-migrations-prod.cjs')], {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
});

process.exit(result.status ?? 1);

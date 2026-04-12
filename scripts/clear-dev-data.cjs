/* eslint-disable @typescript-eslint/no-require */
/**
 * Ejecuta scripts/clear-dev-data.sql contra Postgres usando variables de entorno (.env).
 * Uso: npm run dev:clear-data
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const user = process.env.DB_USER || 'postgres';
  const pass = process.env.DB_PASS || 'postgres';
  const name = process.env.DB_NAME || 'packing_system';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${name}`;
}

async function main() {
  const sqlPath = path.join(__dirname, 'clear-dev-data.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new Client({ connectionString: connectionString() });
  await client.connect();
  try {
    await client.query(sql);
    console.log('OK: datos operativos limpiados (maestros intactos).');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

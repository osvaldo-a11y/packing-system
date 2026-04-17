/* eslint-disable @typescript-eslint/no-require */
/**
 * Ejecuta scripts/clear-dev-data.sql y luego scripts/clear-packaging-catalog.sql.
 * Borra operación + materiales/recetas de empaque.
 *
 * Uso: npm run dev:clear-packaging
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
  const dir = __dirname;
  const client = new Client({ connectionString: connectionString() });
  await client.connect();
  try {
    const operational = fs.readFileSync(path.join(dir, 'clear-dev-data.sql'), 'utf8');
    await client.query(operational);
    console.log('OK: datos operativos limpiados.');

    const catalog = fs.readFileSync(path.join(dir, 'clear-packaging-catalog.sql'), 'utf8');
    await client.query(catalog);
    console.log('OK: materiales, recetas y vínculos proveedor limpiados.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

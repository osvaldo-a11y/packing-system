/* eslint-disable @typescript-eslint/no-require */
/**
 * Pone en 0 el stock de todos los materiales de empaque y borra todo el kardex (movimientos).
 * Efecto: como si no hubiera existencias ni historial de movimientos registrados en maestro.
 *
 * Uso: npm run packaging:reset-all-stock
 */
require('dotenv').config();
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
  const client = new Client({ connectionString: connectionString() });
  await client.connect();
  try {
    await client.query('BEGIN');
    const del = await client.query('DELETE FROM packaging_material_movements');
    const upd = await client.query(
      `UPDATE packaging_materials SET cantidad_disponible = '0'`,
    );
    await client.query('COMMIT');
    console.log(`OK: ${del.rowCount ?? 0} movimiento(s) de kardex eliminados.`);
    console.log(`OK: ${upd.rowCount ?? 0} material(es) con stock en 0.`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

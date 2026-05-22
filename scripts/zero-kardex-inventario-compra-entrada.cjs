/* eslint-disable @typescript-eslint/no-require */
/**
 * Borra movimientos de kardex tipo inventario inicial, compra y entrada (todas las filas).
 * La existencia (`packaging_materials.cantidad_disponible`) no se modifica: reingresá movimientos desde la app.
 *
 * Uso (con .env cargado): npm run packaging:kardex-zero-entrances
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
    const res = await client.query(
      `DELETE FROM packaging_material_movements
       WHERE LOWER(TRIM(COALESCE(ref_type, ''))) IN ('inventario_inicial', 'compra', 'entrada')`,
    );
    console.log(`OK: eliminadas ${res.rowCount ?? 0} fila(s) (inventario_inicial, compra, entrada).`);
    console.log('Recordá: el stock actual del maestro no cambia; el Kardex puede no cuadrar hasta que cargues de nuevo.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

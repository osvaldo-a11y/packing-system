/**
 * Auditoría: facturas por despacho (invoice_items).
 * Uso: node scripts/audit-dispatch-invoices.cjs [ids...]
 * Ej: node scripts/audit-dispatch-invoices.cjs 2 3
 */
require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const ids = process.argv.slice(2).map(Number).filter((n) => n > 0);

  const url = process.env.DATABASE_URL;
  const client = url
    ? new Client({ connectionString: url, ssl: process.env.DB_SSL_DISABLED === 'true' ? false : { rejectUnauthorized: false } })
    : new Client({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASS || 'postgres',
        database: process.env.DB_NAME || 'packing_system',
      });

  await client.connect();
  try {
    const headers = await client.query(
      `
      SELECT i.id AS invoice_id, i.dispatch_id, i.invoice_number, i.subtotal, i.total_cost, i.total
      FROM invoices i
      ${ids.length ? 'WHERE i.dispatch_id = ANY($1::int[])' : ''}
      ORDER BY i.dispatch_id
      `,
      ids.length ? [ids] : [],
    );

    console.log('=== Cabeceras de factura ===');
    console.table(headers.rows);

    const items = await client.query(
      `
      SELECT
        ii.id AS line_id,
        ii.invoice_id,
        inv.dispatch_id,
        ii.is_manual,
        ii.tarja_id,
        ii.final_pallet_id,
        ii.packaging_code,
        ii.cajas,
        ii.pounds,
        ii.unit_price,
        ii.line_subtotal
      FROM invoice_items ii
      JOIN invoices inv ON inv.id = ii.invoice_id
      ${ids.length ? 'WHERE inv.dispatch_id = ANY($1::int[])' : ''}
      ORDER BY inv.dispatch_id, ii.id
      `,
      ids.length ? [ids] : [],
    );

    console.log('\n=== Líneas de factura (detalle) ===');
    if (items.rows.length === 0) {
      console.log('(ninguna fila en invoice_items para el filtro)');
    } else {
      console.table(items.rows);
    }

    const counts = await client.query(
      `
      SELECT inv.dispatch_id, COUNT(ii.id)::int AS line_count, SUM(ii.line_subtotal::numeric) AS sum_line_subtotal
      FROM invoices inv
      LEFT JOIN invoice_items ii ON ii.invoice_id = inv.id
      ${ids.length ? 'WHERE inv.dispatch_id = ANY($1::int[])' : ''}
      GROUP BY inv.dispatch_id
      ORDER BY inv.dispatch_id
      `,
      ids.length ? [ids] : [],
    );
    console.log('\n=== Conteo por despacho ===');
    console.table(counts.rows);

    const emptyInv = await client.query(`
      SELECT i.id AS invoice_id, i.dispatch_id, i.invoice_number, i.total
      FROM invoices i
      LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
      GROUP BY i.id, i.dispatch_id, i.invoice_number, i.total
      HAVING COUNT(ii.id) = 0
      ORDER BY i.id
    `);
    console.log('\n=== Invoice-health (facturas sin ninguna línea) ===');
    console.log(emptyInv.rows.length === 0 ? '0 filas problemáticas (OK).' : `ATENCIÓN: ${emptyInv.rows.length} factura(s) sin detalle:`);
    if (emptyInv.rows.length) console.table(emptyInv.rows);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

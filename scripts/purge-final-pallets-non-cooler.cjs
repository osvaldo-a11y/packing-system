/**
 * Diagnóstico + purge: deja sólo final_pallets 374–388 (Cooler histórico).
 *
 * node scripts/purge-final-pallets-non-cooler.cjs           → diagnóstico + purge
 * node scripts/purge-final-pallets-non-cooler.cjs --dry-run → sólo PASO 1 y 2
 */
require('dotenv').config();
const path = require('path');
const { spawnSync } = require('child_process');
const { Client } = require('pg');

const KEEP = [374, 375, 376, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386, 387, 388];
const DRY = process.argv.includes('--dry-run');

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });
  await client.connect();

  console.log('\n=== PASO 1 — Definitivos en depósito (dispatch_id NULL) ===\n');
  const paso1 = await client.query(`
    SELECT fp.id,
           fp.status,
           fp.dispatch_id,
           fp.tarja_id,
           fp.dispatch_unit,
           fp.bol AS fp_bol,
           pt.bol AS pt_bol
    FROM final_pallets fp
    LEFT JOIN pt_tags pt ON pt.id = fp.tarja_id
    WHERE fp.status = 'definitivo'
      AND fp.dispatch_id IS NULL
    ORDER BY fp.id
  `);
  console.table(paso1.rows);
  console.log('Total definitivo sin despacho:', paso1.rowCount);

  const cooler = paso1.rows.filter((r) => KEEP.includes(Number(r.id)));
  const otros = paso1.rows.filter((r) => !KEEP.includes(Number(r.id)));
  console.log('\nCooler (374–388) en ese listado:', cooler.length);
  console.log(
    'IDs cooler:',
    cooler.map((r) => r.id).join(', '),
  );
  console.log('\nOtros en depósito (no 374–388):', otros.length);
  console.table(
    otros.map((r) => ({
      id: r.id,
      tarja_id: r.tarja_id,
      dispatch_unit: r.dispatch_unit,
      fp_bol: r.fp_bol,
      pt_bol: r.pt_bol,
    })),
  );

  console.log('\nPASO 1b — ¿De dónde vienen los “otros”? (resumen rápido)\n');
  const sinTarja = otros.filter((r) => r.tarja_id == null).length;
  console.log('- Sin pt_tag (tarja_id NULL):', sinTarja);
  console.log(
    '- Con tarja:',
    otros.length - sinTarja,
    '(flujo normal/import previo/smoke antes del Cooler import)',
  );

  console.log('\n=== PASO 2 — Conteos sobre definitivo sin despacho ===\n');
  const paso2 = await client.query(`
    SELECT COUNT(*)::int AS total_deposito,
           COUNT(*) FILTER (WHERE id BETWEEN $1 AND $2)::int AS cooler_ids,
           COUNT(*) FILTER (WHERE id NOT BETWEEN $1 AND $2)::int AS otros_existentes,
           MIN(id) AS id_min,
           MAX(id) AS id_max
    FROM final_pallets
    WHERE status = 'definitivo'
      AND dispatch_id IS NULL
  `, [Math.min(...KEEP), Math.max(...KEEP)]);
  console.table(paso2.rows);

  console.log('\n=== FKs que referencian final_pallets (PostgreSQL) ===');
  const fks = await client.query(`
    SELECT c.conrelid::regclass::text AS child_table,
           pg_get_constraintdef(c.oid, true) AS constraint_def
    FROM pg_constraint c
    WHERE c.confrelid = 'final_pallets'::regclass
      AND c.contype = 'f'
    ORDER BY 1
  `);
  console.table(fks.rows);

  if (DRY) {
    console.log('\n(--dry-run) No se ejecuta purge.');
    await client.end();
    return;
  }

  /** Todos los final_pallets a eliminar (no sólo depot), para borrar pallets en otros estados también. */
  const doomedRes = await client.query(
    `SELECT id FROM final_pallets WHERE id NOT IN (${KEEP.map((_, i) => `$${i + 1}`).join(', ')})`,
    KEEP,
  );
  const doomed = doomedRes.rows.map((r) => Number(r.id));
  if (doomed.length === 0) {
    console.log('\nNada que purgar.');
    await client.end();
    return;
  }

  console.log('\n=== PASO 3 — Purge (transacción) ===');
  console.log('final_pallets a eliminar:', doomed.length, '(primeros)', doomed.slice(0, 25), doomed.length > 25 ? '...' : '');

  const dels = {};

  async function cnt(label, sql, params = []) {
    const r = await client.query(sql, params);
    dels[label] = r.rowCount;
    console.log(`DELETE ${label}: ${r.rowCount}`);
  }

  await client.query('BEGIN');
  try {
    await cnt(
      'repallet_line_provenance por source FINAL_PALLET doom',
      `DELETE FROM repallet_line_provenance WHERE source_final_pallet_id = ANY($1::bigint[])`,
      [doomed],
    );

    await cnt(
      'repallet_sources por source FINAL_PALLET doom',
      `DELETE FROM repallet_sources WHERE source_final_pallet_id = ANY($1::bigint[])`,
      [doomed],
    );

    await cnt(
      'repallet_events por result FINAL_PALLET doom',
      `DELETE FROM repallet_events WHERE result_final_pallet_id = ANY($1::bigint[])`,
      [doomed],
    );

    await cnt(
      'pt_packing_list_items',
      `DELETE FROM pt_packing_list_items WHERE final_pallet_id = ANY($1::bigint[])`,
      [doomed],
    );

    const invNull = await client.query(
      `UPDATE invoice_items SET final_pallet_id = NULL WHERE final_pallet_id = ANY($1::bigint[])`,
      [doomed],
    );
    dels.invoice_items_nulled = invNull.rowCount;
    console.log(`UPDATE invoice_items final_pallet_id → NULL: ${invNull.rowCount}`);

    await cnt(
      'finished_pt_inventory',
      `DELETE FROM finished_pt_inventory WHERE final_pallet_id = ANY($1::bigint[])`,
      [doomed],
    );

    await cnt(
      'final_pallet_lines',
      `DELETE FROM final_pallet_lines WHERE final_pallet_id = ANY($1::bigint[])`,
      [doomed],
    );

    await cnt('final_pallets', `DELETE FROM final_pallets WHERE id = ANY($1::bigint[])`, [doomed]);

    await client.query('COMMIT');
    console.log('\nResumen conteos purge:', dels);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('\nRollback:', e.message);
    throw e;
  }

  console.log('\n=== Post-purge: stock agregado (evitar cajas fantasma de pallets borrados) ===');
  const delStock = await client.query(`DELETE FROM finished_pt_stock`);
  console.log('DELETE finished_pt_stock filas:', delStock.rowCount);

  const root = path.join(__dirname, '..');
  const env = { ...process.env, RECONCILE_FINAL_PALLET_IDS: KEEP.join(',') };
  console.log('\nReconciliando inventario PT sólo para Cooler (Nest)...');
  const spawnRes = spawnSync(
    process.execPath,
    [
      path.join(root, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      '--transpile-only',
      '-r',
      'dotenv/config',
      path.join(root, 'scripts', 'reconcile-final-pallet-ids.ts'),
    ],
    { cwd: root, env, stdio: 'inherit', shell: false },
  );
  if (spawnRes.status !== 0) {
    console.warn('Reconcile Nest falló (código', spawnRes.status, '). Volvé a ejecutar:');
    console.warn(
      `  RECONCILE_FINAL_PALLET_IDS="${KEEP.join(',')}" npx ts-node --transpile-only -r dotenv/config scripts/reconcile-final-pallet-ids.ts`,
    );
  }

  console.log('\n=== PASO 4 — Verificación final ===');
  const cFp = await client.query(`SELECT COUNT(*)::int AS n FROM final_pallets`);
  const cLines = await client.query(`SELECT COUNT(*)::int AS n FROM final_pallet_lines`);
  console.log('COUNT final_pallets:', cFp.rows[0].n, '(esperado 15)');
  console.log('COUNT final_pallet_lines:', cLines.rows[0].n, '(esperado 15)');

  const ag = await client.query(`
    SELECT COUNT(*)::int AS pallets,
           SUM(pt.net_weight_lb)::numeric AS total_lb,
           SUM(pt.total_cajas)::bigint AS total_cajas
    FROM final_pallets fp
    JOIN pt_tags pt ON pt.id = fp.tarja_id
  `);
  console.log('Agregado PT:', JSON.stringify(ag.rows[0], null, 2));

  const cDepot = await client.query(`
    SELECT COUNT(*)::int AS n FROM final_pallets fp
    WHERE fp.status = 'definitivo' AND fp.dispatch_id IS NULL
  `);
  console.log('Definitivos en depósito (ahora sólo cooler):', cDepot.rows[0].n);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

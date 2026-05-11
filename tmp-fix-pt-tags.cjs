/**
 * Diagnóstico y mantenimiento de pt_tags (import histórico + fechas fuera de rango).
 * Uso: node tmp-fix-pt-tags.cjs
 */
require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });
  await c.connect();

  console.log('\n--- FK → pt_tags(id) ---');
  const fk = await c.query(`
    SELECT c.conname, r.relname AS child_table
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    WHERE c.contype = 'f' AND c.confrelid = 'pt_tags'::regclass
    ORDER BY r.relname, c.conname
  `);
  for (const row of fk.rows) console.log(row.child_table, row.conname);

  console.log('\n--- PROBLEMA 1: agregados por PATRÓN bol ---');
  const p1 = await c.query(`
    SELECT 
      COUNT(*)::int AS total,
      MIN(fecha) AS fecha_min,
      MAX(fecha) AS fecha_max,
      COUNT(*) FILTER (WHERE bol LIKE '%PALLET:%')::int AS importadas_ahora,
      COUNT(*) FILTER (WHERE bol NOT LIKE '%PALLET:%' OR bol IS NULL)::int AS preexistentes
    FROM pt_tags
  `);
  console.log(JSON.stringify(p1.rows[0], null, 2));

  const doomedSel = `
    SELECT pt.id FROM pt_tags pt
    WHERE (pt.bol NOT LIKE '%PALLET:%' OR pt.bol IS NULL)
      AND pt.id NOT IN (SELECT id FROM pt_tags WHERE bol LIKE '%PALLET:%')
  `;

  const preCount = await c.query(`SELECT COUNT(*)::int AS n FROM (${doomedSel}) x`);
  console.log('filas candidatas a DELETE (preexistentes sin PALLET):', preCount.rows[0].n);

  let deleted = 0;
  await c.query('BEGIN');
  try {
    // Limpieza defensiva de tablas conocidas que referencian tarja_id → pt_tags
    await c.query(`DELETE FROM pt_tag_items WHERE tarja_id IN (${doomedSel})`);
    await c.query(`DELETE FROM pt_tag_audits WHERE tarja_id IN (${doomedSel})`);
    await c.query(`
      DELETE FROM pt_tag_merge_sources
      WHERE merge_id IN (SELECT id FROM pt_tag_merges WHERE result_tarja_id IN (${doomedSel}))
         OR source_tarja_id IN (${doomedSel})
    `);
    await c.query(`DELETE FROM pt_tag_lineage WHERE ancestor_tarja_id IN (${doomedSel}) OR descendant_tarja_id IN (${doomedSel})`);
    await c.query(`DELETE FROM pt_tag_merges WHERE result_tarja_id IN (${doomedSel})`);

    await c.query(`UPDATE fruit_processes SET tarja_id = NULL WHERE tarja_id IN (${doomedSel})`);
    await c.query(`UPDATE final_pallets SET tarja_id = NULL WHERE tarja_id IN (${doomedSel})`);

    await c.query(`DELETE FROM dispatch_tag_items WHERE tarja_id IN (${doomedSel})`);
    await c.query(`DELETE FROM invoice_items WHERE tarja_id IN (${doomedSel})`);
    await c.query(`
      DELETE FROM packaging_cost_breakdowns
      WHERE consumption_id IN (
        SELECT id FROM packaging_pallet_consumptions WHERE tarja_id IN (${doomedSel})
      )
    `);
    await c.query(`DELETE FROM packaging_pallet_consumptions WHERE tarja_id IN (${doomedSel})`);

    const delRes = await c.query(`
      DELETE FROM pt_tags
      WHERE id IN (${doomedSel})
      RETURNING id
    `);
    deleted = delRes.rowCount;
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('DELETE falló (rollback):', e.message);
    throw e;
  }

  console.log('\n--- Tras DELETE ---');
  console.log('pt_tags eliminadas:', deleted);
  const totalAfter = await c.query(`SELECT COUNT(*)::int AS n FROM pt_tags`);
  console.log('COUNT(*) pt_tags:', totalAfter.rows[0].n);

  console.log('\n--- PROBLEMA 2: fechas fuera de 2026-04-01 .. 2026-05-31 ---');
  const badCount = await c.query(`
    SELECT COUNT(*)::int AS n
    FROM pt_tags
    WHERE fecha::date < '2026-04-01'::date OR fecha::date > '2026-05-31'::date
  `);
  console.log('total fuera de rango:', badCount.rows[0].n);

  const commonBad = await c.query(`
    SELECT fecha::date AS d, COUNT(*)::int AS n
    FROM pt_tags
    WHERE fecha::date < '2026-04-01'::date OR fecha::date > '2026-05-31'::date
    GROUP BY fecha::date
    ORDER BY n DESC, d DESC
    LIMIT 15
  `);
  console.log('fechas erróneas más frecuentes (top 15):');
  console.table(commonBad.rows);

  const sample = await c.query(`
    SELECT id, fecha, bol, format_code
    FROM pt_tags
    WHERE fecha::date < '2026-04-01'::date OR fecha::date > '2026-05-31'::date
    ORDER BY fecha DESC
    LIMIT 20
  `);
  console.log('muestra (20):');
  console.table(sample.rows);

  const upd = await c.query(`
    UPDATE pt_tags pt
    SET fecha = fp.fecha_proceso
    FROM pt_tag_items pti
    JOIN fruit_processes fp ON fp.id = pti.process_id
    WHERE pti.tarja_id = pt.id
      AND (pt.fecha::date < '2026-04-01'::date OR pt.fecha::date > '2026-05-31'::date)
    RETURNING pt.id
  `);
  console.log('\nfilas pt_tags actualizadas (fecha desde fruit_processes vía pt_tag_items):', upd.rowCount);

  console.log('\n--- Verificación fecha ---');
  const rangeAfter = await c.query(`
    SELECT COUNT(*) FILTER (WHERE fecha::date BETWEEN '2026-04-01'::date AND '2026-05-31'::date)::int AS en_rango,
           COUNT(*)::int AS total,
           MIN(fecha) AS fecha_min,
           MAX(fecha) AS fecha_max
    FROM pt_tags
  `);
  console.log(JSON.stringify(rangeAfter.rows[0], null, 2));

  const stillBad = await c.query(`
    SELECT COUNT(*)::int AS n
    FROM pt_tags
    WHERE fecha::date < '2026-04-01'::date OR fecha::date > '2026-05-31'::date
  `);
  if (stillBad.rows[0].n > 0) {
    console.log('\nAún fuera de rango:', stillBad.rows[0].n);
    const left = await c.query(`
      SELECT id, fecha, bol, format_code
      FROM pt_tags
      WHERE fecha::date < '2026-04-01'::date OR fecha::date > '2026-05-31'::date
      ORDER BY fecha DESC LIMIT 10
    `);
    console.table(left.rows);
  }

  console.log('\n--- Verificación FINAL (conteos) ---');
  const cnt = await c.query(`SELECT COUNT(*)::int AS n FROM pt_tags`);
  const mm = await c.query(`SELECT MIN(fecha) AS min_f, MAX(fecha) AS max_f FROM pt_tags`);
  console.log('COUNT(*):', cnt.rows[0].n);
  console.log('MIN(fecha):', mm.rows[0].min_f, 'MAX(fecha):', mm.rows[0].max_f);

  const fmt = await c.query(`
    SELECT format_code, COUNT(*)::int AS n
    FROM pt_tags
    GROUP BY format_code
    ORDER BY n DESC
  `);
  console.log('por format_code:');
  console.table(fmt.rows);

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Comparación Cooler (sistema antiguo) vs pt_tags importadas.
 * node tmp-verify-cooler-pallets.cjs
 */
require('dotenv').config();
const { Client } = require('pg');

const PALLET_IDS = [
  553, 554, 556, 558, 559, 728, 774, 775, 776, 779, 780, 781, 782,
];

const likeArr = PALLET_IDS.map((id) => `%PALLET:${id}%`);

async function main() {
  const c = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });
  await c.connect();

  const step1 = await c.query(
    `
    SELECT 
      pt.id,
      pt.bol,
      pt.format_code,
      pt.net_weight_lb,
      pt.total_cajas,
      pt.fecha
    FROM pt_tags pt
    WHERE pt.bol LIKE ANY($1::text[])
    ORDER BY pt.bol
    `,
    [likeArr],
  );

  console.log('\n--- PASO 1: PT tags cooler (orden por bol) ---');
  console.table(step1.rows);

  const step2 = await c.query(
    `
    SELECT 
      COUNT(*)::int AS filas,
      SUM(net_weight_lb)::numeric AS total_lb,
      SUM(total_cajas)::bigint AS total_cajas
    FROM pt_tags
    WHERE bol LIKE ANY($1::text[])
    `,
    [likeArr],
  );

  console.log('\n--- PASO 2: Totales cooler ---');
  console.log(step2.rows[0]);

  // Qué pallet_id aparece por fila (extrae dígitos después de PALLET:)
  const byPallet = new Map();
  for (const row of step1.rows) {
    const m = String(row.bol || '').match(/PALLET:(\d+)/);
    const pid = m ? Number(m[1]) : null;
    if (pid == null) continue;
    if (!byPallet.has(pid)) byPallet.set(pid, []);
    byPallet.get(pid).push(row.id);
  }

  console.log('\n--- Cobertura por pallet_id_origen ---');
  for (const id of PALLET_IDS) {
    const rows = byPallet.get(id);
    if (!rows || rows.length === 0) {
      console.log(`  ${id}: FALTANTE en pt_tags`);
    } else {
      console.log(`  ${id}: ${rows.length} fila(s) → pt_tags.id [${rows.join(', ')}]`);
    }
  }

  // PT tags importadas (PALLET:) que no son de la lista cooler
  const importLike = '%|PALLET:%';
  const other = await c.query(
    `
    SELECT pt.id, pt.bol, pt.net_weight_lb, pt.total_cajas
    FROM pt_tags pt
    WHERE pt.bol LIKE $1
      AND NOT (pt.bol LIKE ANY($2::text[]))
    ORDER BY pt.id
    LIMIT 30
    `,
    [importLike, likeArr],
  );
  console.log('\n--- Muestra: PT importadas con PALLET: que NO están en lista Cooler (max 30) ---');
  console.log('(el resto serían pallets ya despachados / otro flujo — esperado)');
  console.table(other.rows);
  const otherCount = await c.query(
    `
    SELECT COUNT(*)::int AS n
    FROM pt_tags pt
    WHERE pt.bol LIKE $1
      AND NOT (pt.bol LIKE ANY($2::text[]))
    `,
    [importLike, likeArr],
  );
  console.log('total PT importadas fuera de lista Cooler:', otherCount.rows[0].n);

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

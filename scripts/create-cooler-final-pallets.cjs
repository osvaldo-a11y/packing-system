/**
 * Crea final_pallets (+ líneas) para las 15 PT tags del Cooler histórico.
 * Ubicación física: dispatch_unit = 'CAMARA' (no hay columna ubicacion en la tabla).
 *
 * Uso: node scripts/create-cooler-final-pallets.cjs
 *
 * Luego sincroniza inventario vía FinalPalletService.reconcileInventoryForPallet
 * (`finished_pt_inventory` + `finished_pt_stock`).
 */
require('dotenv').config();
const path = require('path');
const { spawnSync } = require('child_process');
const { Client } = require('pg');

const LIKE_PATTERNS = [
  '%PALLET:553%',
  '%PALLET:554%',
  '%PALLET:556%',
  '%PALLET:558%',
  '%PALLET:559%',
  '%PALLET:728%',
  '%PALLET:774%',
  '%PALLET:775%',
  '%PALLET:776%',
  '%PALLET:779%',
  '%PALLET:780%',
  '%PALLET:781%',
  '%PALLET:782%',
];

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });
  await client.connect();

  const schemaNote = await client.query(`
    SELECT column_name, is_nullable, column_default, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'final_pallets'
    ORDER BY ordinal_position
  `);
  console.log('\n--- final_pallets columns (reference) ---');
  console.table(schemaNote.rows);

  const { rows: src } = await client.query(
    `
    SELECT DISTINCT ON (pt.id)
      pt.id AS tarja_id,
      pt.fecha,
      pt.format_code AS pt_format_code,
      pt.client_id,
      pt.brand_id,
      pt.total_cajas,
      pt.net_weight_lb,
      pt.bol AS pt_bol,
      pti.process_id AS fruit_process_id,
      fp.variedad_id,
      v.species_id,
      pf.id AS presentation_format_id
    FROM pt_tags pt
    INNER JOIN pt_tag_items pti ON pti.tarja_id = pt.id
    INNER JOIN fruit_processes fp ON fp.id = pti.process_id AND fp.deleted_at IS NULL
    INNER JOIN varieties v ON v.id = fp.variedad_id
    LEFT JOIN LATERAL (
      SELECT id FROM presentation_formats f
      WHERE LOWER(TRIM(f.format_code)) = LOWER(TRIM(pt.format_code))
      ORDER BY f.id ASC
      LIMIT 1
    ) pf ON true
    WHERE pt.bol LIKE ANY ($1::text[])
    ORDER BY pt.id, pti.id ASC
    `,
    [LIKE_PATTERNS],
  );

  if (src.length !== 15) {
    console.warn(`Se esperaban 15 pt_tags (Cooler); encontradas ${src.length}. Revisar import/bol.`);
  }

  const createdIds = [];
  const skippedExisting = [];
  await client.query('BEGIN');
  try {
    for (const r of src) {
      const exists = await client.query('SELECT id FROM final_pallets WHERE tarja_id = $1 LIMIT 1', [
        r.tarja_id,
      ]);
      if (exists.rowCount > 0) {
        skippedExisting.push(Number(exists.rows[0].id));
        continue;
      }

      const lbs = Number(r.net_weight_lb ?? 0).toFixed(3);
      const bol = r.pt_bol != null ? String(r.pt_bol).trim().slice(0, 100) : null;

      const ins = await client.query(
        `
        INSERT INTO final_pallets (
          status,
          species_id,
          quality_grade_id,
          corner_board_code,
          clamshell_label,
          brand_id,
          dispatch_unit,
          packing_type,
          market,
          bol,
          planned_sales_order_id,
          client_id,
          fruit_quality_mode,
          presentation_format_id,
          dispatch_id,
          pt_packing_list_id,
          tarja_id,
          created_at,
          updated_at
        ) VALUES (
          'definitivo',
          $1,
          NULL,
          '',
          '',
          $2,
          $3,
          '',
          '',
          $4,
          NULL,
          $5,
          'proceso',
          $6,
          NULL,
          NULL,
          $7,
          NOW(),
          NOW()
        )
        RETURNING id
        `,
        [
          r.species_id,
          r.brand_id,
          'CAMARA',
          bol,
          r.client_id,
          r.presentation_format_id,
          r.tarja_id,
        ],
      );

      const fpId = Number(ins.rows[0].id);
      await client.query(`UPDATE final_pallets SET corner_board_code = $2 WHERE id = $1`, [
        fpId,
        `PF-${fpId}`,
      ]);

      await client.query(
        `
        INSERT INTO final_pallet_lines (
          final_pallet_id,
          line_order,
          fruit_process_id,
          fecha,
          ref_text,
          variety_id,
          caliber,
          amount,
          pounds,
          net_lb
        ) VALUES ($1, 0, $2, $3::timestamp, NULL, $4, NULL, $5, $6::numeric, $6::numeric)
        `,
        [fpId, r.fruit_process_id, r.fecha, r.variedad_id, r.total_cajas, lbs],
      );

      createdIds.push(fpId);
      console.log(
        `Creado final_pallet ${fpId} ← tarja ${r.tarja_id}, proceso ${r.fruit_process_id}, formato_id ${r.presentation_format_id}`,
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }

  const reconcileIds = [...createdIds, ...skippedExisting];
  console.log('\nIDs nuevos:', createdIds);
  console.log('Ya existían (omitidos):', skippedExisting);

  const root = path.join(__dirname, '..');
  const env = { ...process.env, RECONCILE_FINAL_PALLET_IDS: reconcileIds.join(',') };
  if (reconcileIds.length > 0) {
    console.log('\n--- Nest reconcileInventoryForPallet ---');
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
      console.warn('Nest reconcile terminó con código', spawnRes.status);
      console.warn(
        'Podés ejecutar tras npm install: RECONCILE_FINAL_PALLET_IDS="%s" npx ts-node --transpile-only -r dotenv/config scripts/reconcile-final-pallet-ids.ts',
        reconcileIds.join(','),
      );
    }
  }

  console.log('\n--- PASO 2: solo depósito (COUNT) ---');
  const c2 = await client.query(`
    SELECT COUNT(*)::int AS n
    FROM final_pallets fp
    WHERE fp.status = 'definitivo'
      AND fp.dispatch_id IS NULL
  `);
  console.log('COUNT(*) definitivo sin despacho:', c2.rows[0].n);

  console.log('\n--- PASO 3: Cooler list en depósito (mismos patrones bol) ---');
  const c3 = await client.query(
    `
    SELECT
      COUNT(*)::int AS pallets,
      SUM(pt.net_weight_lb)::numeric AS total_lb,
      SUM(pt.total_cajas)::bigint AS total_cajas
    FROM final_pallets fp
    JOIN pt_tags pt ON pt.id = fp.tarja_id
    WHERE fp.status = 'definitivo'
      AND fp.dispatch_id IS NULL
      AND pt.bol LIKE ANY ($1::text[])
  `,
    [LIKE_PATTERNS],
  );
  console.log(JSON.stringify(c3.rows[0], null, 2));

  console.log('\n(Opcional) Todo definitivo sin despacho — COUNT incluye otros pallets en depósito:');
  const cAll = await client.query(`
    SELECT COUNT(*)::int AS n FROM final_pallets fp
    WHERE fp.status = 'definitivo' AND fp.dispatch_id IS NULL
  `);
  console.log('TOTAL depósito (no sólo cooler):', cAll.rows[0].n);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

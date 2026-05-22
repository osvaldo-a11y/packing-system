require('dotenv').config();
const { Client } = require('pg');

const localUrl = `postgresql://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
const railwayUrl = process.env.RAILWAY_URL;
/** Opcional: solo una tabla, ej. SYNC_TABLE=packaging_materials */
const onlyTable = (process.env.SYNC_TABLE || '').trim() || null;
const BATCH_SIZE = 80;

if (!railwayUrl) {
  console.error('❌ RAILWAY_URL no encontrada en .env');
  process.exit(1);
}

function sqlValue(v, udtName) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (udtName === 'json' || udtName === 'jsonb') {
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return v;
  if (typeof v === 'object' && !(v instanceof Buffer)) return v;
  return v;
}

async function loadColumnTypes(client, table) {
  const res = await client.query(
    `SELECT column_name, udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return new Map(res.rows.map((r) => [r.column_name, r.udt_name]));
}

async function insertTable(local, railway, table, colTypes) {
  const rows = await local.query(`SELECT * FROM "${table}"`);
  if (rows.rows.length === 0) {
    console.log(`⬜ ${table}: vacía`);
    return 0;
  }

  const cols = Object.keys(rows.rows[0]);
  const colsSql = cols.map((c) => `"${c}"`).join(', ');
  const colCount = cols.length;

  for (let i = 0; i < rows.rows.length; i += BATCH_SIZE) {
    const batch = rows.rows.slice(i, i + BATCH_SIZE);
    const valuePlaceholders = batch
      .map(
        (_, rowIdx) =>
          `(${cols.map((__, colIdx) => `$${rowIdx * colCount + colIdx + 1}`).join(', ')})`,
      )
      .join(', ');
    const values = batch.flatMap((row) => cols.map((c) => sqlValue(row[c], colTypes.get(c))));
    await railway.query(
      `INSERT INTO "${table}" (${colsSql}) VALUES ${valuePlaceholders}`,
      values,
    );
  }
  console.log(`✅ ${table}: ${rows.rows.length} filas`);
  return rows.rows.length;
}

/** Alinea secuencias SERIAL/IDENTITY al MAX(id) tras volcar datos. */
async function resetSequences(railway) {
  const res = await railway.query(`
    SELECT c.relname AS table_name, a.attname AS column_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND pg_get_expr(ad.adbin, ad.adrelid) LIKE 'nextval%'
      AND a.attnum > 0
      AND NOT a.attisdropped
  `);
  let n = 0;
  for (const { table_name, column_name } of res.rows) {
    const seq = await railway.query(
      `SELECT pg_get_serial_sequence($1, $2) AS seq`,
      [table_name, column_name],
    );
    const seqName = seq.rows[0]?.seq;
    if (!seqName) continue;
    const safeTable = table_name.replace(/"/g, '""');
    const safeCol = column_name.replace(/"/g, '""');
    const safeSeq = seqName.replace(/'/g, "''");
    await railway.query(
      `SELECT setval('${safeSeq}'::regclass, COALESCE((SELECT MAX("${safeCol}") FROM "${safeTable}"), 1), true)`,
    );
    n++;
  }
  console.log(`🔢 Secuencias actualizadas: ${n}`);
}

async function sync() {
  const local = new Client({ connectionString: localUrl });
  const railway = new Client({ connectionString: railwayUrl });

  try {
    await local.connect();
    await railway.connect();
    console.log('✅ Conectado a ambas BDs');

    let tables;
    if (onlyTable) {
      tables = [onlyTable];
      console.log(`📋 Tabla única: ${onlyTable}`);
      await railway.query('SET session_replication_role = replica;');
    } else {
      const tablesRes = await local.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name != 'migrations'
      ORDER BY table_name
    `);
      tables = tablesRes.rows.map((r) => r.table_name);
      console.log(`📋 Tablas a sincronizar: ${tables.length}`);
      await railway.query('SET session_replication_role = replica;');
    }

    if (!onlyTable) {
      console.log('🗑️  Vaciando todas las tablas en Railway (una sola pasada)…');
      for (const table of tables) {
        await railway.query(`TRUNCATE TABLE "${table}" CASCADE`);
      }
    }

    let totalRows = 0;
    const failed = [];
    for (const table of tables) {
      try {
        if (onlyTable) {
          await railway.query(`TRUNCATE TABLE "${table}" CASCADE`);
        }
        const colTypes = await loadColumnTypes(local, table);
        totalRows += await insertTable(local, railway, table, colTypes);
      } catch (e) {
        failed.push({ table, msg: e.message });
        console.log(`⚠️  ${table}: ${e.message}`);
      }
    }

    if (!onlyTable) {
      try {
        const mig = await local.query(`SELECT * FROM migrations ORDER BY id`);
        await railway.query(`TRUNCATE TABLE migrations`);
        if (mig.rows.length > 0) {
          const cols = Object.keys(mig.rows[0]);
          const colsSql = cols.map((c) => `"${c}"`).join(', ');
          for (const row of mig.rows) {
            const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
            const vals = cols.map((c) => sqlValue(row[c]));
            await railway.query(`INSERT INTO migrations (${colsSql}) VALUES (${placeholders})`, vals);
          }
          console.log(`✅ migrations: ${mig.rows.length} filas (historial alineado)`);
        }
      } catch (e) {
        console.log(`⚠️  migrations: ${e.message}`);
      }
      await resetSequences(railway);
    }

    await railway.query('SET session_replication_role = DEFAULT;');
    console.log(`\n📊 Total filas copiadas: ${totalRows}`);
    if (failed.length) {
      console.log(`⚠️  Tablas con error: ${failed.map((f) => f.table).join(', ')}`);
    }
    console.log('🎉 Sincronización completada');
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    await local.end();
    await railway.end();
  }
}

sync();

require('dotenv').config();
const { Client } = require('pg');

const localUrl = `postgresql://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
const railwayUrl = process.env.RAILWAY_URL;
/** Opcional: solo una tabla, ej. SYNC_TABLE=packaging_materials */
const onlyTable = (process.env.SYNC_TABLE || '').trim() || null;

if (!railwayUrl) {
  console.error('❌ RAILWAY_URL no encontrada en .env');
  process.exit(1);
}

function sqlValue(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (Array.isArray(v)) return v;
  if (typeof v === 'object' && !(v instanceof Buffer)) return v;
  return v;
}

async function syncTable(local, railway, table, opts) {
  const rows = await local.query(`SELECT * FROM "${table}"`);
  if (opts?.replicaRole) await railway.query('SET session_replication_role = replica;');
  await railway.query(`TRUNCATE TABLE "${table}" CASCADE`);
  if (rows.rows.length === 0) {
    console.log(`⬜ ${table}: vacía`);
    return;
  }

  const cols = Object.keys(rows.rows[0]);
  const colsSql = cols.map((c) => `"${c}"`).join(', ');
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');

  for (const row of rows.rows) {
    const vals = cols.map((c) => sqlValue(row[c]));
    await railway.query(`INSERT INTO "${table}" (${colsSql}) VALUES (${placeholders})`, vals);
  }
  console.log(`✅ ${table}: ${rows.rows.length} filas`);
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

    for (const table of tables) {
      try {
        await syncTable(local, railway, table, { replicaRole: !!onlyTable });
      } catch (e) {
        console.log(`⚠️  ${table}: ${e.message}`);
      }
    }

    await railway.query('SET session_replication_role = DEFAULT;');
    console.log('\n🎉 Sincronización completada');
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    await local.end();
    await railway.end();
  }
}

sync();

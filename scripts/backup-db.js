require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('❌ DATABASE_URL no encontrada en .env');
  process.exit(1);
}

const date = new Date().toISOString().slice(0, 10);
const filename = `backup-${date}.sql`;
const outPath = path.join(__dirname, filename);

async function backup() {
  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    console.log('✅ Conectado a la BD...');

    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    let sql = `-- Backup Pinebloom ${new Date().toISOString()}\n`;
    sql += `-- Tablas: ${tables.rows.length}\n\n`;

    for (const { table_name } of tables.rows) {
      const rows = await client.query(`SELECT * FROM "${table_name}"`);
      if (rows.rows.length === 0) continue;
      sql += `-- ${table_name}: ${rows.rows.length} filas\n`;
      for (const row of rows.rows) {
        const cols = Object.keys(row).map(c => `"${c}"`).join(', ');
        const vals = Object.values(row).map(v =>
          v === null ? 'NULL' :
          typeof v === 'number' ? v :
          v instanceof Date ? `'${v.toISOString()}'` :
          `'${String(v).replace(/'/g, "''")}'`
        ).join(', ');
        sql += `INSERT INTO "${table_name}" (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;\n`;
      }
      sql += '\n';
    }

    fs.writeFileSync(outPath, sql);
    console.log(`✅ Backup guardado: ${outPath}`);
    console.log(`📦 Tamaño: ${(fs.statSync(outPath).size / 1024 / 1024).toFixed(2)} MB`);
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

backup();

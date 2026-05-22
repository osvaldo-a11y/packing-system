require('dotenv').config();
const { Client } = require('pg');

const useLocal = process.argv.includes('--local');
const url = useLocal
  ? `postgresql://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`
  : process.env.RAILWAY_URL;
if (!url) {
  console.error(useLocal ? 'DB_* no definidas en .env' : 'RAILWAY_URL no definida en .env');
  process.exit(1);
}

const tables = [
  'receptions',
  'reception_lines',
  'fruit_processes',
  'pt_tags',
  'pt_tag_items',
  'dispatches',
  'clients',
  'producers',
  'packaging_materials',
];

(async () => {
  const c = new Client({ connectionString: url });
  await c.connect();
  console.log(useLocal ? 'Local DB counts:' : 'Railway DB counts:');
  for (const t of tables) {
    const r = await c.query(`SELECT COUNT(*)::int AS n FROM "${t}"`);
    console.log(`  ${t}: ${r.rows[0].n}`);
  }
  const mig = await c.query('SELECT COUNT(*)::int AS n, MAX(id) AS max_id FROM migrations');
  console.log(`  migrations: ${mig.rows[0].n} (max id ${mig.rows[0].max_id})`);
  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

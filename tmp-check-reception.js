require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });
  await c.connect();
  const q1 = await c.query("select id,reference_code,received_at,producer_id,variety_id,notes from receptions where notes='SMOKE_IMPORT_TEST_20260505' order by id desc");
  console.log('receptions', JSON.stringify(q1.rows));
  const q2 = await c.query("select rl.id,rl.reception_id,rl.line_order,rl.species_id,rl.variety_id,rl.quality_grade_id,rl.quantity,rl.net_lb from reception_lines rl join receptions r on r.id=rl.reception_id where r.notes='SMOKE_IMPORT_TEST_20260505' order by rl.line_order,rl.id");
  console.log('reception_lines', JSON.stringify(q2.rows));
  const q3 = await c.query("select id,created_at,username,entity_key,total_rows,inserted,skipped,errors_count from import_logs where entity_key='receptions' order by id desc limit 3");
  console.log('import_logs', JSON.stringify(q3.rows));
  await c.end();
})();

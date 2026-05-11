require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
  await c.connect();
  await c.query('BEGIN');
  await c.query("delete from sales_orders where order_number='SMK-SO-20260505-001'");
  await c.query("delete from raw_material_movements where reception_line_id in (select rl.id from reception_lines rl join receptions r on r.id=rl.reception_id where r.notes='SMOKE_IMPORT_TEST_20260505')");
  await c.query("delete from receptions where notes='SMOKE_IMPORT_TEST_20260505'");
  await c.query('COMMIT');
  console.log('rollback_done');
  await c.end();
})();

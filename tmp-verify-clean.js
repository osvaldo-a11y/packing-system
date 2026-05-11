require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
  await c.connect();
  const q1 = await c.query("select id from receptions where notes='SMOKE_IMPORT_TEST_20260505'");
  const q2 = await c.query("select rl.id from reception_lines rl join receptions r on r.id=rl.reception_id where r.notes='SMOKE_IMPORT_TEST_20260505'");
  const q3 = await c.query("select id from sales_orders where order_number='SMK-SO-20260505-001'");
  const q4 = await c.query("select sol.id from sales_order_lines sol join sales_orders so on so.id=sol.sales_order_id where so.order_number='SMK-SO-20260505-001'");
  const qLog = await c.query("select id,entity_key,total_rows,inserted,errors_count from import_logs where entity_key in ('receptions','sales-orders') order by id desc limit 5");
  console.log('receptions_count', q1.rowCount);
  console.log('reception_lines_count', q2.rowCount);
  console.log('sales_orders_count', q3.rowCount);
  console.log('sales_order_lines_count', q4.rowCount);
  console.log('recent_logs', JSON.stringify(qLog.rows));
  await c.end();
})();

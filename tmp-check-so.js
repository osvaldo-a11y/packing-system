require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
  await c.connect();
  const q1 = await c.query("select id,order_number,cliente_id,requested_pallets,requested_boxes from sales_orders where order_number='SMK-SO-20260505-001'");
  console.log('sales_order', JSON.stringify(q1.rows));
  const q2 = await c.query("select sol.id,sol.requested_boxes,sol.unit_price,pf.format_code from sales_order_lines sol join sales_orders so on so.id=sol.sales_order_id join presentation_formats pf on pf.id=sol.presentation_format_id where so.order_number='SMK-SO-20260505-001' order by sol.sort_order,sol.id");
  console.log('sales_order_lines', JSON.stringify(q2.rows));
  await c.end();
})();

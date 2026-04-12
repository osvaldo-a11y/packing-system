require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client(
    process.env.DATABASE_URL
      ? {
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.DB_SSL_DISABLED === 'true' ? false : { rejectUnauthorized: false },
        }
      : {
          host: process.env.DB_HOST || 'localhost',
          port: Number(process.env.DB_PORT || 5432),
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASS || 'postgres',
          database: process.env.DB_NAME || 'packing_system',
        },
  );
  await client.connect();
  const table = await client.query("SELECT to_regclass('public.packing_costs') AS table_name");
  const migration = await client.query(
    "SELECT id, timestamp, name FROM migrations WHERE name = 'PackingCostsBySpecies1712500033000' ORDER BY id DESC LIMIT 1",
  );
  console.log(
    JSON.stringify(
      {
        table: table.rows[0] || null,
        migration: migration.rows[0] || null,
      },
      null,
      2,
    ),
  );
  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

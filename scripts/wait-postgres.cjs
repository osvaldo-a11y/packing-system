/**
 * Espera a que Postgres acepte conexiones TCP (p. ej. tras `docker compose up -d`).
 * Uso: node scripts/wait-postgres.cjs
 * Env: DB_HOST (default 127.0.0.1), DB_PORT (default 5432), WAIT_PG_MS (default 120000).
 */
const net = require('net');

const host = process.env.DB_HOST || '127.0.0.1';
const port = Number(process.env.DB_PORT || 5432);
const maxMs = Number(process.env.WAIT_PG_MS || 120_000);
const start = Date.now();

function tryConnect() {
  return new Promise((resolve, reject) => {
    const s = net.createConnection({ host, port, timeout: 5000 }, () => {
      s.end();
      resolve(undefined);
    });
    s.on('error', reject);
  });
}

async function main() {
  // eslint-disable-next-line no-console
  console.log(`[wait-postgres] Esperando ${host}:${port} (hasta ${maxMs} ms)...`);
  for (;;) {
    try {
      await tryConnect();
      // eslint-disable-next-line no-console
      console.log(`[wait-postgres] OK en ${Date.now() - start} ms`);
      process.exit(0);
    } catch {
      if (Date.now() - start > maxMs) {
        // eslint-disable-next-line no-console
        console.error(`[wait-postgres] Timeout: no hubo conexión a ${host}:${port}`);
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

main();

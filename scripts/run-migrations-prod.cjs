/**
 * Ejecuta migraciones contra JS compilado (dist) sin usar `typeorm migration:run -d dist/...`,
 * que en Node 20+ puede fallar con ESM (MigrationInterface no exportado).
 *
 * Requiere: npm run build (u otro build que genere dist/database/migrations/*.js)
 */
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const cli = path.join(root, 'node_modules', 'typeorm', 'cli-ts-node-commonjs.js');
const dataSource = path.join(root, 'src', 'database', 'data-source.ts');

const result = spawnSync(process.execPath, [cli, 'migration:run', '-d', dataSource], {
  stdio: 'inherit',
  cwd: root,
  env: { ...process.env, NODE_ENV: 'production' },
});

process.exit(result.status ?? 1);

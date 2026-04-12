import { readFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf-8')) as { version: string };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    /** 0.0.0.0: el preview embebido de Cursor/VS Code a veces no resuelve igual que “localhost” solo. */
    host: true,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        /** Si Nest no está levantado, el proxy falla; sin esto el navegador suele ver 500 sin texto útil. */
        configure(proxy) {
          proxy.on('error', (err: NodeJS.ErrnoException, _req, res) => {
            const out = res as ServerResponse | undefined;
            if (!out || out.headersSent || typeof out.writeHead !== 'function') return;
            const refused = err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET';
            const message = refused
              ? 'No hay API en http://127.0.0.1:3000. Levantá Nest (npm run start:dev) o todo junto (npm run dev:full). Con Postgres: npm run dev:up y npm run migration:run.'
              : `Proxy /api: ${err.message}`;
            out.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
            out.end(JSON.stringify({ statusCode: 503, message }));
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});

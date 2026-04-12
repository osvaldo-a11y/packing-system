import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const baseUrl = process.env.SCREENSHOT_BASE_URL || 'http://localhost:5173';
const apiUrl = process.env.SCREENSHOT_API_URL || 'http://localhost:3000';
const username = process.env.SCREENSHOT_USER || 'admin';
const password = process.env.SCREENSHOT_PASS || 'osaez789';
const outDir = process.env.SCREENSHOT_OUT || join(root, 'module-images', 'screenshots-reales');

const routes = [
  { path: '/', file: '01-inicio.png' },
  { path: '/plant', file: '02-planta.png' },
  { path: '/masters', file: '03-mantenedores.png' },
  { path: '/receptions', file: '04-recepciones.png' },
  { path: '/packaging/materials', file: '05-materiales.png' },
  { path: '/packaging/recipes', file: '06-recetas.png' },
  { path: '/packaging/consumptions', file: '07-consumos.png' },
  { path: '/processes', file: '08-procesos.png' },
  { path: '/pt-tags', file: '09-unidad-pt.png' },
  { path: '/existencias-pt/preparacion', file: '10-pallet-final.png' },
  { path: '/existencias-pt/inventario', file: '11-existencias-pt.png' },
  { path: '/existencias-pt/repaletizar', file: '12-repaletizar.png' },
  { path: '/existencias-pt/packing-lists', file: '13-packing-lists-pt.png' },
  { path: '/sales-orders', file: '14-pedidos.png' },
  { path: '/dispatches', file: '15-despachos.png' },
  { path: '/reporting', file: '16-reportes.png' },
  { path: '/guide/sistema', file: '17-guia-sistema.png' },
  { path: '/about', file: '18-acerca.png' },
];

async function main() {
  await mkdir(outDir, { recursive: true });
  const loginRes = await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!loginRes.ok) throw new Error(`Login API falló: ${loginRes.status}`);
  const { access_token } = await loginRes.json();
  if (!access_token) throw new Error('Login API no devolvió token');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, locale: 'es-ES' });
  const page = await context.newPage();
  await page.addInitScript((t) => localStorage.setItem('ps_token', t), access_token);

  await page.goto(`${baseUrl}/#/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(outDir, '00-login.png'), fullPage: true });

  for (const r of routes) {
    await page.goto(`${baseUrl}/#${r.path}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(2000);
    const out = join(outDir, r.file);
    await page.screenshot({ path: out, fullPage: true });
    console.log(`saved ${out}`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


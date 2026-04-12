/**
 * Capturas de la SPA (HashRouter): todos los módulos y, si hay datos, pantallas de detalle.
 *
 * Uso:
 *   npm run screenshots:app
 *   SCREENSHOT_BASE_URL=http://127.0.0.1:5173 SCREENSHOT_API_URL=http://127.0.0.1:3000 \
 *   SCREENSHOT_USER=admin SCREENSHOT_PASS=admin123 node scripts/capture-app-screenshots.mjs
 *
 * Requiere: Vite en :5173 y API Nest en :3000 (para login y resolución de IDs de detalle).
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const base = process.env.SCREENSHOT_BASE_URL || 'http://127.0.0.1:5173';
const apiUrl = (process.env.SCREENSHOT_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const user = process.env.SCREENSHOT_USER || 'admin';
const pass = process.env.SCREENSHOT_PASS || 'admin123';
const outDir = process.env.SCREENSHOT_OUT || join(root, 'module-images', 'screenshots-reales');

/** Rutas principales (orden de navegación). */
const staticRoutes = [
  { path: '/', file: '01-inicio.png', label: 'Inicio' },
  { path: '/plant', file: '02-planta.png', label: 'Planta' },
  { path: '/masters', file: '03-mantenedores.png', label: 'Mantenedores' },
  { path: '/receptions', file: '04-recepciones.png', label: 'Recepciones' },
  { path: '/packaging/materials', file: '05-materiales.png', label: 'Materiales' },
  { path: '/packaging/recipes', file: '06-recetas.png', label: 'Recetas' },
  { path: '/packaging/consumptions', file: '07-consumos.png', label: 'Consumos' },
  { path: '/processes', file: '08-procesos.png', label: 'Procesos' },
  { path: '/pt-tags', file: '09-tarjas-pt.png', label: 'Tarjas / Unidad PT' },
  { path: '/existencias-pt/inventario', file: '10-existencias-pt.png', label: 'Existencias PT (inventario)' },
  { path: '/existencias-pt/repaletizar', file: '11-repaletizar.png', label: 'Repaletizar' },
  { path: '/existencias-pt/packing-lists', file: '12-packing-lists-pt.png', label: 'Packing lists PT' },
  { path: '/sales-orders', file: '13-pedidos.png', label: 'Pedidos' },
  { path: '/dispatches', file: '14-despachos.png', label: 'Despachos' },
  { path: '/reporting', file: '15-reportes.png', label: 'Reportes' },
  { path: '/guide/sistema', file: '16-guia-sistema.png', label: 'Guía del sistema' },
  { path: '/about', file: '17-acerca.png', label: 'Acerca' },
  { path: '/forbidden', file: '18-prohibido.png', label: 'Prohibido (rol)' },
];

async function loginApi() {
  const loginRes = await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
  });
  if (!loginRes.ok) {
    const t = await loginRes.text();
    throw new Error(`Login API ${loginRes.status}: ${t.slice(0, 200)}`);
  }
  const body = await loginRes.json();
  if (!body.access_token) throw new Error('Login API no devolvió access_token');
  return body.access_token;
}

async function fetchJson(token, path) {
  const r = await fetch(`${apiUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  if (!r.ok) return null;
  return r.json();
}

async function resolveDetailRoutes(token) {
  const extra = [];

  const pallets = await fetchJson(token, '/api/final-pallets');
  const fpId = Array.isArray(pallets) && pallets[0]?.id != null ? Number(pallets[0].id) : null;
  if (fpId) {
    extra.push({
      path: `/existencias-pt/detalle/${fpId}`,
      file: '19-existencia-pt-detalle.png',
      label: `Detalle existencia PT (#${fpId})`,
    });
  }

  const pls = await fetchJson(token, '/api/pt-packing-lists');
  const plId = Array.isArray(pls) && pls[0]?.id != null ? Number(pls[0].id) : null;
  if (plId) {
    extra.push({
      path: `/existencias-pt/packing-lists/${plId}`,
      file: '20-packing-list-pt-detalle.png',
      label: `Detalle packing list PT (#${plId})`,
    });
  }

  const orders = await fetchJson(token, '/api/sales-orders');
  const soId = Array.isArray(orders) && orders[0]?.id != null ? Number(orders[0].id) : null;
  if (soId) {
    extra.push({
      path: `/sales-orders/${soId}/avance`,
      file: '21-pedido-avance.png',
      label: `Avance pedido (#${soId})`,
    });
  }

  return extra;
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const token = await loginApi();
  const detailRoutes = await resolveDetailRoutes(token);
  const routes = [...staticRoutes, ...detailRoutes];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'es-ES',
  });
  const page = await context.newPage();

  console.log(`Pantalla de login ${base}/#/login …`);
  await page.goto(`${base}/#/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('#username', { timeout: 30_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(outDir, '00-login.png'), fullPage: true });
  console.log(`  guardado ${join(outDir, '00-login.png')}`);

  /**
   * Sin recarga, React ya montó AuthContext con token null; solo escribir localStorage no actualiza el estado.
   * Las rutas protegidas redirigen a #/login y las capturas muestran el login (“Acceso al panel…”).
   * Tras reload, el provider lee ps_token y el login redirige al inicio autenticado.
   */
  await page.evaluate((t) => localStorage.setItem('ps_token', t), token);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !window.location.hash.includes('login'), null, { timeout: 30_000 });
  await page.waitForFunction(
    () => {
      const h = document.querySelector('h1');
      return h != null && /Hola/i.test((h.textContent || '').trim());
    },
    null,
    { timeout: 25_000 },
  );
  await page.waitForTimeout(800);

  for (const { path: hashPath, file, label } of routes) {
    const url = `${base}/#${hashPath}`;
    console.log(`→ ${label}: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForTimeout(2200);
    const pathFs = join(outDir, file);
    await page.screenshot({ path: pathFs, fullPage: true });
    console.log(`  guardado ${pathFs}`);
  }

  await browser.close();
  console.log(`\nListo: ${routes.length} pantallas + login (00-login.png) → ${outDir}`);
  if (!detailRoutes.length) {
    console.log(
      '(Sin capturas 19–21: no hubo datos en API para existencia / packing list / pedido, o la API no respondió.)',
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

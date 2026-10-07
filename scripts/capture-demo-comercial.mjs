/**
 * Capturas Desktop 1440×900 y Mobile 390×844 del entorno demo (datos Pinebloom).
 * API+front: SCREENSHOT_BASE_URL (default http://127.0.0.1:3000)
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import { join } from 'path';

const baseUrl = (process.env.SCREENSHOT_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const username = process.env.SCREENSHOT_USER || 'admin.demo';
const password = process.env.SCREENSHOT_PASS || 'demo123';
const outDir = process.env.SCREENSHOT_OUT || '/opt/cursor/artifacts/demo-comercial';

const routes = [
  { path: '/', file: 'home' },
  { path: '/receptions', file: 'recepciones' },
  { path: '/processes', file: 'procesos' },
  { path: '/pt-tags', file: 'unidad-pt' },
  { path: '/existencias-pt/inventario', file: 'stock-camara' },
  { path: '/existencias-pt/repaletizar', file: 'repaletizaje' },
  { path: '/existencias-pt/packing-lists', file: 'packing-lists' },
  { path: '/dispatches', file: 'despachos' },
  { path: '/packaging/materials', file: 'materiales' },
];

async function loginToken() {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`Login ${res.status} ${await res.text()}`);
  const { access_token } = await res.json();
  return access_token;
}

async function shoot(page, name) {
  const path = join(outDir, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log('saved', path);
}

async function runViewport(browser, token, viewport, prefix) {
  const loginCtx = await browser.newContext({ viewport, locale: 'es-ES' });
  const loginPage = await loginCtx.newPage();
  await loginPage.goto(`${baseUrl}/#/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await loginPage.waitForTimeout(500);
  await shoot(loginPage, `${prefix}-00-login`);
  await loginCtx.close();

  const context = await browser.newContext({ viewport, locale: 'es-ES' });
  const page = await context.newPage();
  await page.addInitScript((t) => localStorage.setItem('ps_token', t), token);

  for (const r of routes) {
    await page.goto(`${baseUrl}/#${r.path}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1200);
    await shoot(page, `${prefix}-${r.file}`);
  }

  if (prefix === 'd1440') {
    await page.goto(`${baseUrl}/#/packaging/materials`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const kardexBtn = page.getByRole('button', { name: /kardex|movimiento/i }).first();
    if (await kardexBtn.count()) {
      await kardexBtn.click();
      await page.waitForTimeout(800);
      await shoot(page, `${prefix}-materiales-kardex`);
    }
  }

  await context.close();
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const token = await loginToken();
  const browser = await chromium.launch({ headless: true });
  await runViewport(browser, token, { width: 1440, height: 900 }, 'd1440');
  await runViewport(browser, token, { width: 390, height: 844 }, 'm390');
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

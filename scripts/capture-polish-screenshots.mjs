import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const baseUrl = process.env.SCREENSHOT_BASE_URL || 'http://localhost:5174';
const apiUrl = process.env.SCREENSHOT_API_URL || 'http://localhost:3000';
const username = process.env.SCREENSHOT_USER || 'admin';
const password = process.env.SCREENSHOT_PASS || 'osaez789';
const outDir = process.env.SCREENSHOT_OUT || join(root, 'module-images', 'screenshots-reales');

const routes = [
  { path: '/packaging/recipes', file: 'polish-recetas.png' },
  { path: '/existencias-pt/preparacion', file: 'polish-pallet-final.png' },
  { path: '/dispatches', file: 'polish-despachos.png' },
  { path: '/reporting', file: 'polish-reportes.png' },
];

async function main() {
  await mkdir(outDir, { recursive: true });

  const loginRes = await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!loginRes.ok) throw new Error(`Login API falló: ${loginRes.status}`);
  const loginJson = await loginRes.json();
  const token = loginJson?.access_token;
  if (!token) throw new Error('Login API no devolvió token');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, locale: 'es-ES' });
  const page = await context.newPage();
  await page.addInitScript((t) => localStorage.setItem('ps_token', t), token);

  for (const r of routes) {
    const url = `${baseUrl}/#${r.path}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(2500);
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

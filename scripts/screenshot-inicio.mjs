/**
 * Captura única de la pantalla Inicio (dashboard) autenticada.
 * Requiere Vite en :5173 y API en :3000.
 */
import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outPath = join(root, 'dashboard-inicio-screenshot.png');

const base = process.env.SCREENSHOT_BASE_URL || 'http://127.0.0.1:5173';
const apiUrl = (process.env.SCREENSHOT_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const user = process.env.SCREENSHOT_USER || 'admin';
const pass = process.env.SCREENSHOT_PASS || 'admin123';

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

async function main() {
  const token = await loginApi();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'es-ES',
  });
  const page = await context.newPage();
  await page.goto(`${base}/#/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('#username', { timeout: 30_000 });
  await page.evaluate((t) => localStorage.setItem('ps_token', t), token);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !window.location.hash.includes('login'), null, { timeout: 30_000 });
  await page.goto(`${base}/#/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: outPath, fullPage: true });
  await browser.close();
  console.log(outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

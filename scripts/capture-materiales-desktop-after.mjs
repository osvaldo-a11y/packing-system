import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = process.argv[2] || '/opt/cursor/artifacts/materiales-desktop/after';
fs.mkdirSync(OUT, { recursive: true });
const base = process.env.APP_URL || 'http://127.0.0.1:5173';

async function clean(page) {
  await page.evaluate(() => document.querySelectorAll('[data-sonner-toast]').forEach((n) => n.remove()));
  await page.waitForTimeout(120);
}

async function login(page) {
  await page.goto(`${base}/#/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const pwd = page.locator('input[type="password"]');
  if (await pwd.count()) {
    const textInputs = page.locator('input:not([type="password"]):not([type="hidden"])');
    if (await textInputs.count()) await textInputs.first().fill('admin');
    await pwd.fill('admin123');
    await page.locator('button[type="submit"], button:has-text("Entrar")').first().click();
    await page.waitForTimeout(2500);
  }
  await clean(page);
}

async function shot(page, dir, name) {
  const file = path.join(dir, name);
  await page.waitForTimeout(200);
  await page.screenshot({ path: file, fullPage: false });
  const ox = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log('saved', name, 'overflowX=', ox);
  return file;
}

async function openNuevoDespacho(page) {
  await page.evaluate(() => {
    const root = document.querySelector('.font-inter') || document.getElementById('root');
    if (!root) return false;
    const key = Object.keys(root).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    if (!key) return false;
    let found = false;
    function walk(fiber) {
      if (!fiber || found) return;
      const p = fiber.memoizedProps || fiber.pendingProps;
      if (p && typeof p.onOpenChange === 'function' && 'open' in p && p.open === false) {
        p.onOpenChange(true);
        found = true;
        return;
      }
      walk(fiber.child);
      walk(fiber.sibling);
    }
    walk(root[key]);
    return found;
  });
  await page.waitForTimeout(900);
  return page.locator('[role="dialog"]').first().isVisible();
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(page);
  await page.goto(`${base}/#/packaging/materials`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo(0, 0));
  await clean(page);
  await shot(page, OUT, 'B_materiales_desktop.png');

  const hero = page.locator('[data-materials-desktop-hero]');
  if (await hero.count()) await hero.screenshot({ path: path.join(OUT, 'E_hero.png') });
  const kpis = page.locator('[data-materials-desktop-kpis]');
  if (await kpis.count()) await kpis.screenshot({ path: path.join(OUT, 'F_indicadores.png') });
  const filters = page.locator('[data-materials-desktop-filters]');
  if (await filters.count()) await filters.screenshot({ path: path.join(OUT, 'H_filtros.png') });
  const empty = page.locator('[data-materials-empty]');
  if (await empty.count()) await empty.screenshot({ path: path.join(OUT, 'J_empty.png') });

  await page.goto(`${base}/#/dispatches`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await clean(page);
  await shot(page, OUT, 'K_despachos_desktop.png');
  const opened = await openNuevoDespacho(page);
  console.log('desktop dialog', opened);
  if (opened) await shot(page, OUT, 'nuevo_despacho_desktop.png');
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await login(page);
  await page.goto(`${base}/#/dispatches`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await clean(page);
  await shot(page, OUT, 'L_despachos_mobile.png');
  const opened = await openNuevoDespacho(page);
  console.log('mobile sheet', opened);
  if (opened) await shot(page, OUT, 'nuevo_despacho_mobile.png');

  await page.goto(`${base}/#/packaging/materials`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await clean(page);
  await shot(page, OUT, 'materiales_mobile_unchanged_check.png');
  await page.close();
}

await browser.close();
console.log('AFTER screenshots done', OUT);

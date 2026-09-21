import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = process.argv[2] || '/opt/cursor/artifacts/agregar-material-desktop/before';
fs.mkdirSync(OUT, { recursive: true });
const base = process.env.APP_URL || 'http://127.0.0.1:5173';

async function clean(page) {
  await page.evaluate(() => document.querySelectorAll('[data-sonner-toast]').forEach((n) => n.remove()));
  await page.waitForTimeout(80);
}
async function login(page) {
  await page.goto(`${base}/#/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
  const pwd = page.locator('input[type="password"]');
  if (await pwd.count()) {
    await page.locator('input:not([type="password"]):not([type="hidden"])').first().fill('admin');
    await pwd.fill('admin123');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2200);
  }
  await clean(page);
}
async function shot(page, name) {
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  const ox = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log('saved', name, 'overflowX=', ox);
}
async function openFiberDialog(page) {
  await page.evaluate(() => {
    const root = document.querySelector('.font-inter') || document.getElementById('root');
    if (!root) return;
    const key = Object.keys(root).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    if (!key) return;
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
  });
  await page.waitForTimeout(800);
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(page);
  for (const [name, route] of [
    ['home', '/'],
    ['receptions', '/receptions'],
    ['processes', '/processes'],
    ['pt_tags', '/pt-tags'],
    ['stock', '/existencias-pt/inventario'],
    ['dispatches', '/dispatches'],
    ['materials', '/packaging/materials'],
  ]) {
    await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo(0, 0));
    await clean(page);
    await shot(page, `${name}_desktop.png`);
  }

  await page.goto(`${base}/#/dispatches`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await openFiberDialog(page);
  await shot(page, 'F_nuevo_despacho_desktop.png');

  await page.goto(`${base}/#/pt-tags`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await openFiberDialog(page);
  await shot(page, 'G_nueva_unidad_pt_desktop.png');

  await page.goto(`${base}/#/packaging/materials`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.locator('[data-materials-desktop-hero] button:has-text("Material rápido")').click();
  await page.waitForTimeout(500);
  await shot(page, 'B_material_rapido_desktop.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  await page.locator('[data-materials-desktop-hero] button:has-text("Agregar material")').click();
  await page.waitForTimeout(500);
  await shot(page, 'A_agregar_material_desktop.png');
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await login(page);
  for (const [name, route] of [
    ['home', '/'],
    ['receptions', '/receptions'],
    ['processes', '/processes'],
    ['pt_tags', '/pt-tags'],
    ['stock', '/existencias-pt/inventario'],
    ['dispatches', '/dispatches'],
    ['materials', '/packaging/materials'],
  ]) {
    await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo(0, 0));
    await clean(page);
    await shot(page, `${name}_mobile.png`);
  }
  await page.goto(`${base}/#/packaging/materials`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.locator('[data-materials-mobile-hero] button:has-text("Material rápido")').click();
  await page.waitForTimeout(500);
  await shot(page, 'C_material_rapido_mobile.png');
  await page.close();
}

await browser.close();
console.log('ANTES', OUT);

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = process.argv[2] || '/opt/cursor/artifacts/materiales-mobile/after';
fs.mkdirSync(OUT, { recursive: true });
const base = process.env.APP_URL || 'http://127.0.0.1:5173';

const ROUTES = [
  ['home', '/'],
  ['receptions', '/receptions'],
  ['processes', '/processes'],
  ['pt_tags', '/pt-tags'],
  ['stock', '/existencias-pt/inventario'],
  ['repallet', '/existencias-pt/repaletizar'],
  ['packing_lists', '/existencias-pt/packing-lists'],
  ['dispatches', '/dispatches'],
  ['materials', '/packaging/materials'],
];

async function clean(page) {
  await page.evaluate(() => document.querySelectorAll('[data-sonner-toast]').forEach((n) => n.remove()));
  await page.waitForTimeout(80);
}

async function login(page) {
  await page.goto(`${base}/#/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
  const pwd = page.locator('input[type="password"]');
  if (await pwd.count()) {
    const textInputs = page.locator('input:not([type="password"]):not([type="hidden"])');
    if (await textInputs.count()) await textInputs.first().fill('admin');
    await pwd.fill('admin123');
    await page.locator('button[type="submit"], button:has-text("Entrar")').first().click();
    await page.waitForTimeout(2200);
  }
  await clean(page);
}

async function shot(page, name) {
  const file = path.join(OUT, name);
  await page.waitForTimeout(150);
  await page.screenshot({ path: file, fullPage: false });
  const ox = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log('saved', name, 'overflowX=', ox);
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
  await page.waitForTimeout(800);
  return page.locator('[role="dialog"]').first().isVisible();
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

async function tour(viewport, suffix) {
  const page = await browser.newPage(viewport);
  await login(page);
  for (const [name, route] of ROUTES) {
    await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.evaluate(() => window.scrollTo(0, 0));
    await clean(page);
    await shot(page, `${name}_${suffix}.png`);
  }
  await page.goto(`${base}/#/dispatches`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await clean(page);
  const opened = await openNuevoDespacho(page);
  console.log('nuevo despacho', suffix, opened);
  if (opened) await shot(page, `nuevo_despacho_${suffix}.png`);
  await page.close();
}

await tour({ viewport: { width: 1440, height: 900 } }, 'desktop');

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await login(page);
  for (const [name, route] of ROUTES) {
    await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.evaluate(() => window.scrollTo(0, 0));
    await clean(page);
    await shot(page, `${name}_mobile.png`);
  }

  await page.goto(`${base}/#/packaging/materials`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await clean(page);
  await shot(page, 'A_top.png');
  const hero = page.locator('[data-materials-mobile-hero]');
  if (await hero.count()) await hero.screenshot({ path: path.join(OUT, 'B_hero.png') });
  const kpis = page.locator('[data-materials-mobile-kpis]');
  if (await kpis.count()) await kpis.screenshot({ path: path.join(OUT, 'D_kpis.png') });
  const inv = page.locator('[data-materials-inventory]');
  if (await inv.count()) await inv.screenshot({ path: path.join(OUT, 'E_inventario.png') });
  const filters = page.locator('[data-materials-mobile-filters]');
  if (await filters.count()) await filters.screenshot({ path: path.join(OUT, 'F_filtros_cerrados.png') });
  await page.locator('[data-materials-mobile-filters] button:has-text("Más filtros")').click();
  await page.waitForTimeout(250);
  if (await filters.count()) await filters.screenshot({ path: path.join(OUT, 'G_filtros_abiertos.png') });
  const empty = page.locator('[data-materials-empty]');
  if (await empty.count()) await empty.screenshot({ path: path.join(OUT, 'H_empty.png') });
  const notices = page.locator('[data-materials-notices]');
  if (await notices.count()) await notices.screenshot({ path: path.join(OUT, 'I_avisos.png') });
  await page.evaluate(() => window.scrollTo(0, 280));
  await page.waitForTimeout(200);
  await shot(page, 'K_scroll_medio.png');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(200);
  await shot(page, 'L_scroll_final.png');
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.goto(`${base}/#/dispatches`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await clean(page);
  const opened = await openNuevoDespacho(page);
  console.log('nuevo despacho mobile', opened);
  if (opened) await shot(page, 'nuevo_despacho_mobile.png');
  await page.close();
}

await browser.close();
console.log('AFTER done', OUT);

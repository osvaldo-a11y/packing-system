import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = process.argv[2] || '/opt/cursor/artifacts/material-rapido-desktop/after';
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

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(page);
  for (const [name, route] of ROUTES) {
    await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(650);
    await page.evaluate(() => window.scrollTo(0, 0));
    await clean(page);
    await shot(page, `${name}_desktop.png`);
  }
  await page.goto(`${base}/#/dispatches`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await clean(page);
  if (await openNuevoDespacho(page)) await shot(page, 'nuevo_despacho_desktop.png');

  await page.goto(`${base}/#/packaging/materials`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.locator('[data-materials-desktop-hero] button:has-text("Material rápido")').click();
  await page.waitForTimeout(600);
  await shot(page, 'B_implementado.png');
  const dlg = page.locator('[data-quick-material-dialog]');
  if (await dlg.count()) {
    await dlg.screenshot({ path: path.join(OUT, 'dialog.png') });
    const ox = await page.evaluate(() => {
      const el = document.querySelector('[data-quick-material-dialog]');
      if (!el) return -1;
      return el.scrollWidth - el.clientWidth;
    });
    console.log('dialog overflowX', ox);
  }
  const header = page.locator('[data-quick-material-header]');
  if (await header.count()) await header.screenshot({ path: path.join(OUT, 'E_header.png') });
  const body = page.locator('[data-quick-material-body]');
  if (await body.count()) await body.screenshot({ path: path.join(OUT, 'body.png') });
  const review = page.locator('[data-quick-material-review]');
  if (await review.count()) await review.screenshot({ path: path.join(OUT, 'I_review.png') });

  await page.locator('[data-quick-material-dialog] button[type="submit"]').click();
  await page.waitForTimeout(400);
  await shot(page, 'O_validacion.png');

  await page.locator('[data-quick-material-dialog] input').first().fill('Cinta 48mm');
  await page.locator('[data-quick-material-dialog] select').first().selectOption({ index: 1 }).catch(() => {});
  await page.waitForTimeout(300);
  await shot(page, 'P_con_datos.png');

  await page.locator('[data-quick-material-header] button[aria-label]').click();
  await page.waitForTimeout(300);
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await login(page);
  for (const [name, route] of ROUTES) {
    await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(650);
    await page.evaluate(() => window.scrollTo(0, 0));
    await clean(page);
    await shot(page, `${name}_mobile.png`);
  }
  await page.goto(`${base}/#/dispatches`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await clean(page);
  if (await openNuevoDespacho(page)) await shot(page, 'nuevo_despacho_mobile.png');
  await page.close();
}

await browser.close();
console.log('AFTER done', OUT);

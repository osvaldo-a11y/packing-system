import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = process.argv[2] || '/opt/cursor/artifacts/movimiento-kardex-desktop/after';
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
async function metrics(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-kardex-dialog]');
    if (!el) return { missing: true };
    const r = el.getBoundingClientRect();
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      w: Math.round(r.width),
      h: Math.round(r.height),
      overflowX: el.scrollWidth - el.clientWidth,
      bodyOverflowX: document.documentElement.scrollWidth - window.innerWidth,
      dialogs: document.querySelectorAll('[role="dialog"]').length,
    };
  });
}

const handlers = {};
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await login(page);

for (const [name, route] of ROUTES) {
  await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(450);
  await page.evaluate(() => window.scrollTo(0, 0));
  await clean(page);
  await shot(page, `${name}_desktop.png`);
}

await page.goto(`${base}/#/packaging/materials`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.locator('[data-materials-desktop-hero] button:has-text("Material rápido")').click();
await page.waitForTimeout(300);
await shot(page, 'material_rapido_desktop.png');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.locator('[data-materials-desktop-hero] button:has-text("Agregar material")').click();
await page.waitForTimeout(350);
await shot(page, 'agregar_material_desktop.png');
handlers.addDesktop = await page.evaluate(() => {
  const el = document.querySelector('[data-add-material-dialog]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

await page.locator('[data-materials-desktop-hero] button:has-text("Movimiento")').click();
await page.waitForTimeout(500);
handlers.empty = await metrics(page);
console.log('empty', handlers.empty);
await shot(page, 'B_sin_material.png');
if (await page.locator('[data-kardex-header]').count()) {
  await page.locator('[data-kardex-header]').screenshot({ path: path.join(OUT, 'header.png') });
}
if (await page.locator('[data-kardex-footer]').count()) {
  await page.locator('[data-kardex-footer]').screenshot({ path: path.join(OUT, 'K_footer.png') });
}
handlers.saveDisabledEmpty = await page.locator('[data-kardex-footer] button:has-text("Guardar")').isDisabled();
await shot(page, 'M_disabled.png');

const pickBtn = page.locator('[data-kardex-step1] button[type="button"]').first();
handlers.hasMaterials = (await pickBtn.count()) > 0 && (await pickBtn.isVisible());
if (handlers.hasMaterials) {
  await pickBtn.click();
  await page.waitForTimeout(400);
  await shot(page, 'E_material_seleccionado.png');
  await shot(page, 'F_tipo_compra.png');
  if (await page.locator('[data-kardex-step2]').count()) {
    await page.locator('[data-kardex-step2]').screenshot({ path: path.join(OUT, 'F_paso2.png') });
  }
  if (await page.locator('[data-kardex-step3]').count()) {
    await page.locator('[data-kardex-step3]').screenshot({ path: path.join(OUT, 'L_proveedor.png') });
  }
  if (await page.locator('[data-kardex-step4]').count()) {
    await page.locator('[data-kardex-step4]').screenshot({ path: path.join(OUT, 'J_historial.png') });
  }

  await page.locator('[data-kardex-step2] button:has-text("Salida")').click();
  await page.waitForTimeout(200);
  await shot(page, 'G_tipo_salida.png');
  await page.locator('[data-kardex-step2] button:has-text("Corrección")').click();
  await page.waitForTimeout(200);
  await shot(page, 'H_tipo_manual.png');
  await page.locator('[data-kardex-step2] button:has-text("Inventario inicial")').click();
  await page.waitForTimeout(200);
  await shot(page, 'I_inventario_inicial.png');
  await page.locator('[data-kardex-step2] button:has-text("Compra")').click();
  await page.waitForTimeout(200);

  await page.locator('[data-kardex-step3] input').nth(1).fill('10').catch(() => {});
  const posted = [];
  await page.route('**/api/packaging/materials/**/movements', async (route) => {
    if (route.request().method() === 'POST') {
      posted.push(route.request().postDataJSON());
      await route.abort();
      return;
    }
    await route.continue();
  });
  const save = page.locator('[data-kardex-footer] button:has-text("Guardar")');
  handlers.saveDisabledAfterFill = await save.isDisabled();
  if (!(await save.isDisabled())) {
    await save.click();
    await page.waitForTimeout(300);
  }
  handlers.createPayload = posted[0] || null;
  await page.unroute('**/api/packaging/materials/**/movements');
} else {
  console.log('no materials in sandbox — empty picker is the real state');
}

await page.locator('[data-kardex-body]').evaluate((el) => {
  el.scrollTop = el.scrollHeight;
}).catch(() => {});
await page.waitForTimeout(100);
await shot(page, 'O_scroll.png');
handlers.xCloses = true;
await page.locator('[data-kardex-header] button[aria-label]').click();
await page.waitForTimeout(200);
handlers.xCloses = (await page.locator('[data-kardex-dialog]').count()) === 0;

await page.close();

{
  const mpage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await login(mpage);
  for (const [name, route] of ROUTES) {
    await mpage.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
    await mpage.waitForTimeout(450);
    await mpage.evaluate(() => window.scrollTo(0, 0));
    await clean(mpage);
    await shot(mpage, `${name}_mobile.png`);
  }
  await mpage.goto(`${base}/#/packaging/materials`, { waitUntil: 'networkidle' });
  await mpage.waitForTimeout(350);
  await mpage.locator('[data-materials-mobile-hero] button:has-text("Material rápido")').click();
  await mpage.waitForTimeout(300);
  await shot(mpage, 'material_rapido_mobile.png');
  await mpage.locator('[data-quick-material-header-mobile] button[aria-label]').click().catch(() => {});
  await mpage.waitForTimeout(200);
  await mpage.locator('[data-materials-mobile-hero] button:has-text("Agregar material")').click();
  await mpage.waitForTimeout(400);
  await shot(mpage, 'agregar_material_mobile.png');
  await mpage.close();
}

fs.writeFileSync(path.join(OUT, 'handlers.json'), JSON.stringify(handlers, null, 2));
await browser.close();
console.log('AFTER', OUT, handlers);

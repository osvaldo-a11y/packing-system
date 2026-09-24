import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = process.argv[2] || '/opt/cursor/artifacts/agregar-material-desktop-ux-final';
const BEFORE = '/opt/cursor/artifacts/agregar-material-desktop/after/B_implementado_vacio.png';
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
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  const ox = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log('saved', name, 'overflowX=', ox);
}
async function metrics(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-add-material-dialog]');
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

const ROUTES = [
  ['home', '/'],
  ['receptions', '/receptions'],
  ['processes', '/processes'],
  ['pt_tags', '/pt-tags'],
  ['stock', '/existencias-pt/inventario'],
  ['dispatches', '/dispatches'],
  ['materials', '/packaging/materials'],
];

const handlers = {};
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await login(page);
for (const [name, route] of ROUTES) {
  await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await clean(page);
  await shot(page, `${name}_desktop.png`);
}

await page.goto(`${base}/#/packaging/materials`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.locator('[data-materials-desktop-hero] button:has-text("Material rápido")').click();
await page.waitForTimeout(350);
await shot(page, 'material_rapido_desktop.png');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

await page.locator('[data-materials-desktop-hero] button:has-text("Agregar material")').click();
await page.waitForTimeout(450);
handlers.empty = await metrics(page);
console.log('empty', handlers.empty);
await shot(page, 'A_vacio.png');
await shot(page, 'F_cierre_natural.png');

await page.locator('[data-add-material-footer] button[type="submit"]').click();
await page.waitForTimeout(350);
await shot(page, 'validacion_vacio.png');
handlers.nameError = ((await page.locator('[data-add-material-step1] .text-destructive').first().textContent()) || '').trim();
await page.locator('#material_category_id').selectOption('0');
await page.locator('[data-add-material-footer] button[type="submit"]').click();
await page.waitForTimeout(350);
await shot(page, 'validacion_categoria.png');
const errs = await page.locator('[data-add-material-step1] .text-destructive').allTextContents();
handlers.validationErrors = errs.map((s) => s.trim());

await page.locator('#nombre_material').fill('Cinta 48mm');
await page.locator('#descripcion').fill('Nota de prueba');
const catSelect = page.locator('#material_category_id');
const bolsa = await catSelect.locator('option').evaluateAll((opts) => {
  const hit = opts.find((o) => /bolsa/i.test(o.textContent || ''));
  return hit ? hit.value : null;
});
if (bolsa) await catSelect.selectOption(bolsa);
await page.waitForTimeout(200);
await shot(page, 'B_con_datos.png');
handlers.withData = await metrics(page);
console.log('withData', handlers.withData);

const clientBoxes = page.locator('[data-add-material-step3] input[type="checkbox"]');
if ((await clientBoxes.count()) > 0) await clientBoxes.nth(0).check();
await page.locator('#unidad_medida').selectOption('lb');
await page.locator('#costo_unitario').fill('1.2505');
await page.waitForTimeout(200);
await shot(page, 'C_cliente_seleccionado.png');
handlers.footerClient = ((await page.locator('[data-add-material-footer]').textContent()) || '').replace(/\s+/g, ' ').trim();
handlers.withClient = await metrics(page);

const clamshellVal = await catSelect.locator('option').evaluateAll((opts) => {
  const hit = opts.find((o) => /clamshell/i.test(o.textContent || ''));
  return hit ? hit.value : null;
});
if (clamshellVal) {
  await catSelect.selectOption(clamshellVal);
  await page.waitForTimeout(250);
  const clam = page.locator('[data-add-material-step4] input[placeholder="1"]');
  if (await clam.count()) await clam.fill('12.5');
  await page.waitForTimeout(150);
  await shot(page, 'D_clamshell.png');
  handlers.clamshell = await metrics(page);
  console.log('clamshell', handlers.clamshell);
}

let posted = false;
await page.route('**/api/packaging/materials', async (route) => {
  if (route.request().method() === 'POST') {
    posted = true;
    handlers.createPayload = route.request().postDataJSON();
    await route.abort();
    return;
  }
  await route.continue();
});
await page.locator('[data-add-material-footer] button[type="submit"]').click();
await page.waitForTimeout(350);
handlers.createHandlerFired = posted;
await page.unroute('**/api/packaging/materials');

await page.locator('[data-add-material-header] button[aria-label]').click();
await page.waitForTimeout(200);
handlers.xCloses = (await page.locator('[data-add-material-dialog]').count()) === 0;
await page.locator('[data-materials-desktop-hero] button:has-text("Agregar material")').click();
await page.waitForTimeout(300);
await page.locator('[data-add-material-footer] button:has-text("Cancelar")').click();
await page.waitForTimeout(200);
handlers.cancelCloses = (await page.locator('[data-add-material-dialog]').count()) === 0;
await page.close();

{
  const mpage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await login(mpage);
  for (const [name, route] of ROUTES) {
    await mpage.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
    await mpage.waitForTimeout(500);
    await mpage.evaluate(() => window.scrollTo(0, 0));
    await clean(mpage);
    await shot(mpage, `${name}_mobile.png`);
  }
  await mpage.goto(`${base}/#/packaging/materials`, { waitUntil: 'networkidle' });
  await mpage.waitForTimeout(350);
  await mpage.locator('[data-materials-mobile-hero] button:has-text("Material rápido")').click();
  await mpage.waitForTimeout(350);
  await shot(mpage, 'material_rapido_mobile.png');
  await mpage.close();
}

fs.writeFileSync(path.join(OUT, 'handlers.json'), JSON.stringify(handlers, null, 2));
await browser.close();
console.log('UX FINAL', OUT, handlers);

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = process.argv[2] || '/opt/cursor/artifacts/agregar-material-desktop/after';
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
async function dialogMetrics(page) {
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
      radius: getComputedStyle(el).borderRadius,
    };
  });
}

const handlers = {};
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await login(page);

const ROUTES = [
  ['home', '/'],
  ['receptions', '/receptions'],
  ['processes', '/processes'],
  ['pt_tags', '/pt-tags'],
  ['stock', '/existencias-pt/inventario'],
  ['dispatches', '/dispatches'],
  ['materials', '/packaging/materials'],
];
for (const [name, route] of ROUTES) {
  await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(550);
  await page.evaluate(() => window.scrollTo(0, 0));
  await clean(page);
  await shot(page, `${name}_desktop.png`);
}

await page.goto(`${base}/#/packaging/materials`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await shot(page, 'U_materiales_desktop_post.png');
await page.locator('[data-materials-desktop-hero] button:has-text("Material rápido")').click();
await page.waitForTimeout(400);
await shot(page, 'T_material_rapido_desktop_post.png');
await page.keyboard.press('Escape');
await page.waitForTimeout(250);

await page.locator('[data-materials-desktop-hero] button:has-text("Agregar material")').click();
await page.waitForTimeout(500);
const metrics = await dialogMetrics(page);
console.log('add dialog', metrics);
fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2));
await shot(page, 'B_implementado_vacio.png');

const dlg = page.locator('[data-add-material-dialog]');
if (await dlg.locator('[data-add-material-header]').count()) {
  await dlg.locator('[data-add-material-header]').screenshot({ path: path.join(OUT, 'E_header.png') });
}
if (await dlg.locator('[data-add-material-step1]').count()) {
  await dlg.locator('[data-add-material-step1]').screenshot({ path: path.join(OUT, 'F_paso1.png') });
}
if (await dlg.locator('[data-add-material-step2]').count()) {
  await dlg.locator('[data-add-material-step2]').screenshot({ path: path.join(OUT, 'G_paso2_formatos.png') });
}
if (await dlg.locator('[data-add-material-step3]').count()) {
  await dlg.locator('[data-add-material-step3]').screenshot({ path: path.join(OUT, 'H_paso3_clientes.png') });
}
if (await dlg.locator('[data-add-material-step4]').count()) {
  await dlg.locator('[data-add-material-step4]').screenshot({ path: path.join(OUT, 'I_paso4_unidad_costo.png') });
}
if (await dlg.locator('[data-add-material-footer]').count()) {
  await dlg.locator('[data-add-material-footer]').screenshot({ path: path.join(OUT, 'J_footer.png') });
}

await page.locator('#nombre_material').fill('');
await page.locator('[data-add-material-footer] button[type="submit"]').click();
await page.waitForTimeout(350);
await shot(page, 'K_validacion_nombre.png');
handlers.nameError = ((await page.locator('[data-add-material-step1] .text-destructive').first().textContent()) || '').trim();

await page.locator('#material_category_id').selectOption('0');
await page.locator('[data-add-material-footer] button[type="submit"]').click();
await page.waitForTimeout(350);
await shot(page, 'L_validacion_categoria.png');
handlers.categoryError = ((await page.locator('[data-add-material-step1] .text-destructive').nth(1).textContent().catch(() => '')) || '').trim();

await page.locator('#nombre_material').fill('Cinta 48mm');
await page.locator('#descripcion').fill('Nota de prueba');
const catSelect = page.locator('#material_category_id');
const firstRealCat = await catSelect.locator('option').nth(1).getAttribute('value');
if (firstRealCat) await catSelect.selectOption(firstRealCat);

const formatBoxes = page.locator('[data-add-material-step2] input[type="checkbox"]');
const fmtCount = await formatBoxes.count();
if (fmtCount > 0) await formatBoxes.nth(0).check();
if (fmtCount > 1) await formatBoxes.nth(1).check();
await page.waitForTimeout(200);
await shot(page, 'M_dos_formatos.png');
await page.locator('[data-add-material-step2]').screenshot({ path: path.join(OUT, 'M_paso2_dos_formatos.png') });

const clientBoxes = page.locator('[data-add-material-step3] input[type="checkbox"]');
if ((await clientBoxes.count()) > 0) await clientBoxes.nth(0).check();
await page.waitForTimeout(200);
await shot(page, 'N_un_cliente.png');
await page.locator('[data-add-material-step3]').screenshot({ path: path.join(OUT, 'N_paso3_un_cliente.png') });

await page.locator('#unidad_medida').selectOption('lb');
await page.locator('#costo_unitario').fill('1.2505');
await shot(page, 'O_categoria_normal.png');

const clamshellVal = await catSelect.locator('option').evaluateAll((opts) => {
  const hit = opts.find((o) => /clamshell/i.test(o.textContent || ''));
  return hit ? hit.value : null;
});
handlers.clamshellOption = clamshellVal;
if (clamshellVal) {
  await catSelect.selectOption(clamshellVal);
  await page.waitForTimeout(250);
  await shot(page, 'P_categoria_clamshell.png');
  const clam = page.locator('[data-add-material-step4] input[placeholder="1"]');
  handlers.clamshellVisible = (await clam.count()) > 0;
  if (await clam.count()) {
    await clam.fill('12.5');
    await page.waitForTimeout(150);
    await shot(page, 'Q_clamshell_units.png');
    await page.locator('[data-add-material-step4]').screenshot({ path: path.join(OUT, 'Q_paso4_clamshell.png') });
  }
}

await page.locator('[data-add-material-footer]').screenshot({ path: path.join(OUT, 'J_footer_live.png') });
handlers.footerLive = ((await page.locator('[data-add-material-footer]').textContent()) || '').replace(/\s+/g, ' ').trim();

await page.locator('[data-add-material-body]').evaluate((el) => {
  el.scrollTop = el.scrollHeight / 2;
});
await page.waitForTimeout(150);
await shot(page, 'R_scroll_medio.png');
await page.locator('[data-add-material-body]').evaluate((el) => {
  el.scrollTop = el.scrollHeight;
});
await page.waitForTimeout(150);
await shot(page, 'S_scroll_final.png');

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
await page.waitForTimeout(400);
handlers.createHandlerFired = posted;
await page.unroute('**/api/packaging/materials');

await page.locator('[data-add-material-header] button[aria-label]').click();
await page.waitForTimeout(250);
handlers.xCloses = (await page.locator('[data-add-material-dialog]').count()) === 0;

await page.locator('[data-materials-desktop-hero] button:has-text("Agregar material")').click();
await page.waitForTimeout(350);
await page.locator('[data-add-material-footer] button:has-text("Cancelar")').click();
await page.waitForTimeout(250);
handlers.cancelCloses = (await page.locator('[data-add-material-dialog]').count()) === 0;

await page.close();

{
  const mpage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await login(mpage);
  for (const [name, route] of ROUTES) {
    await mpage.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
    await mpage.waitForTimeout(550);
    await mpage.evaluate(() => window.scrollTo(0, 0));
    await clean(mpage);
    await shot(mpage, `${name}_mobile.png`);
  }
  await mpage.goto(`${base}/#/packaging/materials`, { waitUntil: 'networkidle' });
  await mpage.waitForTimeout(400);
  await mpage.locator('[data-materials-mobile-hero] button:has-text("Material rápido")').click();
  await mpage.waitForTimeout(400);
  await shot(mpage, 'material_rapido_mobile_post.png');
  await mpage.close();
}

fs.writeFileSync(path.join(OUT, 'handlers.json'), JSON.stringify(handlers, null, 2));
await browser.close();
console.log('AFTER', OUT, handlers);

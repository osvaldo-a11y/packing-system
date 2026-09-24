import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = process.argv[2] || '/opt/cursor/artifacts/agregar-material-mobile/after';
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
async function metrics(page, sel = '[data-add-material-dialog]') {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
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
  }, sel);
}

const handlers = {};
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

{
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
  await page.waitForTimeout(400);
  handlers.desktopEmpty = await metrics(page);
  await shot(page, 'agregar_material_desktop_post.png');
  console.log('desktop empty', handlers.desktopEmpty);
  await page.locator('[data-add-material-header] button[aria-label]').click();
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await login(page);
  for (const [name, route] of ROUTES) {
    await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await clean(page);
    await shot(page, `${name}_mobile.png`);
  }
  await page.goto(`${base}/#/packaging/materials`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.locator('[data-materials-mobile-hero] button:has-text("Material rápido")').click();
  await page.waitForTimeout(350);
  await shot(page, 'material_rapido_mobile.png');
  await page.keyboard.press('Escape').catch(() => {});
  await page.locator('[data-quick-material-header-mobile] button[aria-label]').click().catch(() => {});
  await page.waitForTimeout(200);

  await page.locator('[data-materials-mobile-hero] button:has-text("Agregar material")').click();
  await page.waitForTimeout(500);
  handlers.mobileSheet = await metrics(page);
  console.log('mobile sheet', handlers.mobileSheet);
  await shot(page, 'A_top.png');
  const step1 = page.locator('[data-add-material-step1]');
  if (await step1.count()) await step1.screenshot({ path: path.join(OUT, 'B_paso1.png') });

  await page.locator('[data-add-material-footer-mobile] button[type="submit"]').click();
  await page.waitForTimeout(300);
  await page.locator('#material_category_id').selectOption('0');
  await page.locator('[data-add-material-footer-mobile] button[type="submit"]').click();
  await page.waitForTimeout(300);
  await shot(page, 'validacion.png');
  handlers.validation = (await page.locator('[data-add-material-dialog] .text-destructive').allTextContents()).map((s) => s.trim());

  await page.locator('#nombre_material').fill('Cinta 48mm');
  await page.locator('#descripcion').fill('Nota de prueba');
  const catSelect = page.locator('#material_category_id');
  const bolsa = await catSelect.locator('option').evaluateAll((opts) => {
    const hit = opts.find((o) => /bolsa/i.test(o.textContent || ''));
    return hit ? hit.value : null;
  });
  if (bolsa) await catSelect.selectOption(bolsa);

  await page.locator('[data-add-material-step2]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  if (await page.locator('[data-add-material-step2]').count()) {
    await page.locator('[data-add-material-step2]').screenshot({ path: path.join(OUT, 'C_paso2.png') });
  }
  await page.locator('[data-add-material-step3]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  if (await page.locator('[data-add-material-step3]').count()) {
    await page.locator('[data-add-material-step3]').screenshot({ path: path.join(OUT, 'D_paso3.png') });
  }
  const clientBoxes = page.locator('[data-add-material-step3] input[type="checkbox"]');
  if ((await clientBoxes.count()) > 0) await clientBoxes.nth(0).check();
  await page.locator('[data-add-material-step4]').scrollIntoViewIfNeeded();
  await page.locator('#unidad_medida').selectOption('lb');
  await page.locator('#costo_unitario').fill('1.2505');
  await page.waitForTimeout(150);
  if (await page.locator('[data-add-material-step4]').count()) {
    await page.locator('[data-add-material-step4]').screenshot({ path: path.join(OUT, 'E_paso4.png') });
  }

  const clamshellVal = await catSelect.locator('option').evaluateAll((opts) => {
    const hit = opts.find((o) => /clamshell/i.test(o.textContent || ''));
    return hit ? hit.value : null;
  });
  if (clamshellVal) {
    await catSelect.selectOption(clamshellVal);
    await page.waitForTimeout(200);
    const clam = page.locator('[data-add-material-step4] input[placeholder="1"]');
    if (await clam.count()) await clam.fill('12.5');
    await page.locator('[data-add-material-step4]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await shot(page, 'F_clamshell.png');
    if (await page.locator('[data-add-material-step4]').count()) {
      await page.locator('[data-add-material-step4]').screenshot({ path: path.join(OUT, 'F_paso4_clamshell.png') });
    }
  }

  if (await page.locator('[data-add-material-footer-mobile]').count()) {
    await page.locator('[data-add-material-footer-mobile]').screenshot({ path: path.join(OUT, 'G_footer.png') });
  }
  handlers.footerLive = ((await page.locator('[data-add-material-footer-mobile]').textContent()) || '').replace(/\s+/g, ' ').trim();

  await page.locator('[data-add-material-body]').evaluate((el) => {
    el.scrollTop = el.scrollHeight / 2;
  });
  await page.waitForTimeout(120);
  await shot(page, 'H_scroll_medio.png');
  await page.locator('[data-add-material-body]').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(120);
  await shot(page, 'I_scroll_final.png');

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
  await page.locator('[data-add-material-footer-mobile] button[type="submit"]').click();
  await page.waitForTimeout(350);
  handlers.createHandlerFired = posted;
  await page.unroute('**/api/packaging/materials');

  await page.locator('[data-add-material-header-mobile] button[aria-label]').click();
  await page.waitForTimeout(200);
  handlers.xCloses = (await page.locator('[data-add-material-dialog]').count()) === 0;
  await page.locator('[data-materials-mobile-hero] button:has-text("Agregar material")').click();
  await page.waitForTimeout(300);
  await page.locator('[data-add-material-footer-mobile] button:has-text("Cancelar")').click();
  await page.waitForTimeout(200);
  handlers.cancelCloses = (await page.locator('[data-add-material-dialog]').count()) === 0;
  await page.close();
}

fs.writeFileSync(path.join(OUT, 'handlers.json'), JSON.stringify(handlers, null, 2));
await browser.close();
console.log('AFTER', OUT, handlers);

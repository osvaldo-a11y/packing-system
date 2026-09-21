import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = process.argv[2] || '/opt/cursor/artifacts/material-rapido-mobile/after';
fs.mkdirSync(OUT, { recursive: true });
const base = process.env.APP_URL || 'http://127.0.0.1:5173';

const ROUTES = [
  ['home', '/'],
  ['receptions', '/receptions'],
  ['processes', '/processes'],
  ['pt_tags', '/pt-tags'],
  ['stock', '/existencias-pt/inventario'],
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

async function dialogMetrics(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-quick-material-dialog]');
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

const handlers = {};
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(page);
  for (const [name, route] of ROUTES) {
    await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo(0, 0));
    await clean(page);
    await shot(page, `${name}_desktop.png`);
  }
  await page.goto(`${base}/#/packaging/materials`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.locator('[data-materials-desktop-hero] button:has-text("Material rápido")').click();
  await page.waitForTimeout(500);
  await shot(page, 'I_material_rapido_desktop_post.png');
  console.log('desktop dialog', await dialogMetrics(page));
  await page.locator('[data-quick-material-header] button[aria-label]').click();
  await page.waitForTimeout(250);
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await login(page);
  for (const [name, route] of ROUTES) {
    await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo(0, 0));
    await clean(page);
    await shot(page, `${name}_mobile.png`);
  }

  await page.goto(`${base}/#/dispatches`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await openFiberDialog(page);
  await shot(page, 'H_nuevo_despacho_mobile.png');

  await page.goto(`${base}/#/pt-tags`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await openFiberDialog(page);
  await shot(page, 'H_nueva_unidad_pt_mobile.png');

  await page.goto(`${base}/#/packaging/materials`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await shot(page, 'J_materiales_mobile_index_post.png');

  await page.locator('[data-materials-mobile-hero] button:has-text("Material rápido")').click();
  await page.waitForTimeout(500);
  const m0 = await dialogMetrics(page);
  console.log('mobile sheet metrics', JSON.stringify(m0));
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(m0, null, 2));
  await shot(page, 'A_top_vacio.png');
  const card = page.locator('[data-quick-material-body] section').first();
  if (await card.count()) await card.screenshot({ path: path.join(OUT, 'B_card_material.png') });
  const footer = page.locator('[data-quick-material-footer-mobile]');
  if (await footer.count()) await footer.screenshot({ path: path.join(OUT, 'F_footer_vacio.png') });

  await page.locator('[data-quick-material-footer-mobile] button[type="submit"]').click();
  await page.waitForTimeout(400);
  await shot(page, 'C_validacion_requerido.png');
  const errText = await page.locator('[data-quick-material-dialog] .text-destructive').first().textContent().catch(() => '');
  handlers.emptySubmitShowsError = String(errText || '').trim();

  const nameInput = page.locator('[data-quick-material-dialog] input').first();
  await nameInput.click();
  await nameInput.fill('Cinta 48mm');
  await page.waitForTimeout(250);
  await shot(page, 'D_cinta_48mm.png');
  await shot(page, 'G_focus_nombre.png');

  const sel = page.locator('[data-quick-material-dialog] select').first();
  const optionCaja = await sel.locator('option').evaluateAll((opts) => {
    const hit = opts.find((o) => /caja/i.test(o.textContent || ''));
    return hit ? hit.value : null;
  });
  if (optionCaja) await sel.selectOption(optionCaja);
  else await sel.selectOption({ index: 2 }).catch(() => sel.selectOption({ index: 1 }));
  await page.waitForTimeout(250);
  await shot(page, 'E_categoria_caja.png');
  if (await footer.count()) await footer.screenshot({ path: path.join(OUT, 'F_footer_actualizado.png') });
  const footerText = ((await footer.textContent()) || '').replace(/\s+/g, ' ').trim();
  handlers.footerLive = footerText;

  await page.locator('[data-quick-material-body]').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(200);
  await shot(page, 'H_scroll_final.png');

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
  await page.locator('[data-quick-material-footer-mobile] button[type="submit"]').click();
  await page.waitForTimeout(400);
  handlers.createHandlerFired = posted;
  await page.unroute('**/api/packaging/materials');

  await page.locator('[data-quick-material-header-mobile] button[aria-label]').click();
  await page.waitForTimeout(300);
  handlers.xCloses = (await page.locator('[data-quick-material-dialog]').count()) === 0;

  await page.locator('[data-materials-mobile-hero] button:has-text("Material rápido")').click();
  await page.waitForTimeout(400);
  await page.locator('[data-quick-material-footer-mobile] button:has-text("Cancelar")').click();
  await page.waitForTimeout(300);
  handlers.cancelCloses = (await page.locator('[data-quick-material-dialog]').count()) === 0;

  await page.close();
}

fs.writeFileSync(path.join(OUT, 'handlers.json'), JSON.stringify(handlers, null, 2));
await browser.close();
console.log('AFTER', OUT, handlers);

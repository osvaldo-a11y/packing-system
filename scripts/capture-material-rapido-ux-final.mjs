import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = process.argv[2] || '/opt/cursor/artifacts/material-rapido-desktop/ux-final';
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
  const dox = await page.evaluate(() => {
    const el = document.querySelector('[data-quick-material-dialog]');
    return el ? el.scrollWidth - el.clientWidth : null;
  });
  console.log('saved', name, 'overflowX=', ox, 'dialogOx=', dox);
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(page);
  await page.goto(`${base}/#/packaging/materials`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await clean(page);
  await shot(page, 'E_materials_desktop.png');

  await page.locator('[data-materials-desktop-hero] button:has-text("Material rápido")').click();
  await page.waitForTimeout(500);
  await shot(page, 'A_vacio.png');

  await page.locator('[data-quick-material-dialog] button[type="submit"]').click();
  await page.waitForTimeout(350);
  await shot(page, 'B_validacion.png');

  await page.locator('[data-quick-material-dialog] input').first().fill('Cinta 48mm');
  await page.waitForTimeout(200);
  const select = page.locator('[data-quick-material-dialog] select').first();
  const options = await select.locator('option').count();
  if (options > 2) await select.selectOption({ index: 2 }).catch(() => {});
  await page.waitForTimeout(250);
  await shot(page, 'C_cinta.png');
  const footer = page.locator('[data-quick-material-dialog] [class*="DialogFooter"], [data-quick-material-dialog] form > div:last-child');
  await shot(page, 'D_full_for_footer.png');
  await page.locator('[data-quick-material-header] button[aria-label]').click();
  await page.waitForTimeout(200);
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await login(page);
  await page.goto(`${base}/#/packaging/materials`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await clean(page);
  await shot(page, 'F_materials_mobile.png');
  await page.close();
}

await browser.close();
console.log('UX final capture done', OUT);

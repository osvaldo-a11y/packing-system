import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = '/opt/cursor/artifacts/gold-master/impl';
fs.mkdirSync(OUT, { recursive: true });
const base = 'http://127.0.0.1:5173';

async function login(page) {
  await page.goto(`${base}/#/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const pwd = page.locator('input[type="password"]');
  if (await pwd.count()) {
    const inputs = page.locator('input');
    // username likely first text input
    const textInputs = page.locator('input:not([type="password"]):not([type="hidden"])');
    if (await textInputs.count()) await textInputs.first().fill('admin');
    await pwd.fill('admin123');
    await page.locator('button[type="submit"], button:has-text("Entrar")').first().click();
    await page.waitForTimeout(2500);
  }
}

async function shot(page, name) {
  const file = path.join(OUT, name);
  await page.waitForTimeout(600);
  await page.screenshot({ path: file, fullPage: false });
  console.log('saved', file, 'url=', page.url());
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(page);
  await page.goto(`${base}/#/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, 'home_desktop.png');

  await page.goto(`${base}/#/receptions`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, 'receptions_desktop.png');
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await login(page);
  await page.goto(`${base}/#/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, 'home_mobile.png');

  await page.goto(`${base}/#/receptions`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot(page, 'receptions_mobile.png');

  // open new reception dialog
  const btn = page.getByRole('button', { name: /Nueva/i }).first();
  if (await btn.count()) {
    await btn.click();
  } else {
    await page.locator('button').filter({ hasText: /Nueva|recepci/i }).first().click().catch(()=>{});
  }
  await page.waitForTimeout(1800);
  await shot(page, 'new_reception_mobile.png');
  await page.close();
}

await browser.close();
console.log('done');

import { chromium } from 'playwright';

const base = process.env.APP_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await page.goto(`${base}/#/login`, { waitUntil: 'networkidle' });
const pwd = page.locator('input[type="password"]');
if (await pwd.count()) {
  await page.locator('input:not([type="password"]):not([type="hidden"])').first().fill('admin');
  await pwd.fill('admin123');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2000);
}
await page.goto(`${base}/#/packaging/materials`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const ox = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
console.log('overflowX', ox);
const header = await page.locator('header.sticky, header.z-40').first().innerText();
console.log('top header', header.replace(/\n/g, ' | ').slice(0, 80));
const nav = await page.locator('nav[aria-label]').last().innerText();
console.log('bottom nav', nav.replace(/\n/g, ' | '));

await page.locator('[data-materials-mobile-hero] button:has-text("Material rápido")').click();
await page.waitForTimeout(400);
console.log('quick', (await page.locator('[role="dialog"]').innerText()).slice(0, 40).replace(/\n/g, ' | '));
await page.keyboard.press('Escape');
await page.waitForTimeout(250);

await page.locator('[data-materials-mobile-hero] button:has-text("Agregar material")').click();
await page.waitForTimeout(400);
console.log('add', (await page.locator('[role="dialog"]').innerText()).slice(0, 40).replace(/\n/g, ' | '));
await page.keyboard.press('Escape');
await page.waitForTimeout(250);

await page.locator('[data-materials-mobile-hero] button:has-text("Movimiento / kardex")').click();
await page.waitForTimeout(400);
console.log('kardex', (await page.locator('[role="dialog"]').innerText()).slice(0, 40).replace(/\n/g, ' | '));
await page.keyboard.press('Escape');
await page.waitForTimeout(250);

await page.locator('[data-materials-mobile-filters] input').fill('x');
await page.waitForTimeout(150);
console.log('empty after search', await page.locator('[data-materials-empty]').innerText());
await page.locator('[data-materials-mobile-filters] button:has-text("Más filtros")').click();
console.log('select visible', await page.locator('[data-materials-mobile-filters] select').isVisible());

await browser.close();

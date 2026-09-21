import { chromium } from 'playwright';

const base = process.env.APP_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${base}/#/login`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const pwd = page.locator('input[type="password"]');
if (await pwd.count()) {
  await page.locator('input:not([type="password"]):not([type="hidden"])').first().fill('admin');
  await pwd.fill('admin123');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2000);
}
await page.goto(`${base}/#/packaging/materials`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

const quickCount = await page.locator('button:has-text("Material rápido")').count();
const quickVisible = await page.locator('button:has-text("Material rápido")').evaluateAll((els) =>
  els.map((el) => ({
    text: el.textContent.trim(),
    display: getComputedStyle(el).display,
    parentDisplay: getComputedStyle(el.parentElement).display,
    visible: !!(el.offsetWidth || el.offsetHeight),
  })),
);
console.log('quick buttons', quickCount, JSON.stringify(quickVisible, null, 2));

await page.locator('[data-materials-desktop-hero] button:has-text("Material rápido")').click();
await page.waitForTimeout(400);
console.log('quick dialog', (await page.locator('[role="dialog"]').innerText()).slice(0, 60).replace(/\n/g, ' | '));
await page.keyboard.press('Escape');
await page.waitForTimeout(250);

await page.locator('[data-materials-desktop-hero] button:has-text("Agregar material")').click();
await page.waitForTimeout(400);
console.log('add dialog', (await page.locator('[role="dialog"]').innerText()).slice(0, 60).replace(/\n/g, ' | '));
await page.keyboard.press('Escape');
await page.waitForTimeout(250);

await page.locator('[data-materials-desktop-hero] button:has-text("Movimiento / kardex")').click();
await page.waitForTimeout(400);
console.log('kardex dialog', (await page.locator('[role="dialog"]').innerText()).slice(0, 60).replace(/\n/g, ' | '));
await page.keyboard.press('Escape');

await browser.close();

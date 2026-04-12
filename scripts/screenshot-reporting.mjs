import { chromium } from 'playwright';

const baseUrl = 'http://localhost:5174';
const username = process.env.DEMO_USER || 'admin';
const password = process.env.DEMO_PASS || 'admin123';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });

try {
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!loginRes.ok) {
    throw new Error(`Login API falló: ${loginRes.status}`);
  }
  const loginJson = await loginRes.json();
  const token = loginJson?.access_token;
  if (!token) throw new Error('Login API sin token');

  await page.addInitScript((t) => localStorage.setItem('ps_token', t), token);

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  const reportesLink = page.getByRole('link', { name: /Reportes|Reporting/i }).first();
  if (await reportesLink.isVisible().catch(() => false)) {
    await reportesLink.click();
    await page.waitForLoadState('networkidle');
  } else {
    await page.goto(`${baseUrl}/reporting`, { waitUntil: 'networkidle' });
  }
  await page.waitForTimeout(1500);
  const section = page.getByText('Costos de packing por especie').first();
  if (!(await section.isVisible().catch(() => false))) {
    await page.screenshot({ path: 'reporting-debug.png', fullPage: true });
    throw new Error(`No encontré la sección. URL actual: ${page.url()}`);
  }
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'reporting-packing-costs.png', fullPage: true });
  console.log('Screenshot saved: reporting-packing-costs.png');
} finally {
  await browser.close();
}

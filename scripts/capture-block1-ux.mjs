/**
 * Screenshots BLOQUE 1 — Home + AppShell en viewports clave (ES/EN).
 *
 * Por defecto usa JWT de layout (sin API remota) para evidencia visual del shell.
 * Opcional con API real:
 *   SCREENSHOT_USE_API=1 SCREENSHOT_API_URL=… SCREENSHOT_USER=… SCREENSHOT_PASS=…
 *   node scripts/capture-block1-ux.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const base = process.env.SCREENSHOT_BASE_URL || 'http://127.0.0.1:4173';
const apiUrl = (process.env.SCREENSHOT_API_URL || '').replace(/\/$/, '');
const user = process.env.SCREENSHOT_USER || 'demo';
const pass = process.env.SCREENSHOT_PASS || 'demo123';
const useApi = process.env.SCREENSHOT_USE_API === '1' && Boolean(apiUrl);
const outDir = process.env.SCREENSHOT_OUT || join(root, 'module-images', 'block1-ux');

const viewports = [
  { name: '1920', width: 1920, height: 1080 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 768 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844 },
];

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/** Token solo para montar AppShell/Home (AuthContext parsea payload; no valida firma). */
function layoutPreviewToken() {
  const header = b64url({ alg: 'none', typ: 'JWT' });
  const payload = b64url({
    username: 'preview-ops',
    role: 'admin',
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  });
  return `${header}.${payload}.preview`;
}

async function loginApi() {
  const loginRes = await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
  });
  if (!loginRes.ok) {
    const t = await loginRes.text();
    throw new Error(`Login API ${loginRes.status}: ${t.slice(0, 200)}`);
  }
  const body = await loginRes.json();
  if (!body.access_token) throw new Error('Login API no devolvió access_token');
  return body.access_token;
}

async function setLang(page, lang) {
  await page.evaluate((l) => {
    localStorage.setItem('lang', l);
    localStorage.setItem('i18nextLng', l);
    localStorage.setItem('ps_lang', l);
  }, lang);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(900);
}

async function captureHome(page, file) {
  await page.goto(`${base}/#/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(outDir, file), fullPage: true });
  console.log(`  ${file}`);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const token = useApi ? await loginApi() : layoutPreviewToken();
  console.log(`${useApi ? `API OK (${apiUrl})` : 'JWT layout (sin API)'}, capturando → ${outDir}`);

  const browser = await chromium.launch({ headless: true });

  for (const lang of ['es', 'en']) {
    for (const vp of viewports) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        locale: lang === 'es' ? 'es-ES' : 'en-US',
      });
      const page = await context.newPage();
      await page.goto(`${base}/#/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.evaluate((t) => localStorage.setItem('ps_token', t), token);
      await setLang(page, lang);
      await page.waitForFunction(() => !window.location.hash.includes('login'), null, { timeout: 30_000 }).catch(() => {});
      await captureHome(page, `home-${lang}-${vp.name}.png`);

      if (vp.width <= 768) {
        const menu = page.getByRole('button', { name: /menú|menu/i }).first();
        if (await menu.isVisible().catch(() => false)) {
          await menu.click();
          await page.waitForTimeout(600);
          await page.screenshot({ path: join(outDir, `shell-mobile-${lang}-${vp.name}.png`), fullPage: false });
          console.log(`  shell-mobile-${lang}-${vp.name}.png`);
        }
      } else if (vp.width === 1440 && lang === 'es') {
        const collapse = page.getByRole('button', { name: /contraer|colapsar|collapse|expand|expandir/i }).first();
        if (await collapse.isVisible().catch(() => false)) {
          await page.screenshot({ path: join(outDir, `shell-expanded-${lang}.png`), fullPage: false });
          console.log(`  shell-expanded-${lang}.png`);
          await collapse.click();
          await page.waitForTimeout(400);
          await page.screenshot({ path: join(outDir, `shell-collapsed-${lang}.png`), fullPage: false });
          console.log(`  shell-collapsed-${lang}.png`);
        } else {
          await page.screenshot({ path: join(outDir, `shell-expanded-${lang}.png`), fullPage: false });
          console.log(`  shell-expanded-${lang}.png`);
        }
      }

      await context.close();
    }
  }

  await browser.close();
  console.log('\nListo Block 1 UX screenshots.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

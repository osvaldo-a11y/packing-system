/**
 * Capturas para presentación comercial — Pinebloom Packing (producción por defecto).
 *
 *   npm run screenshots:presentation
 *
 * Variables:
 *   SCREENSHOT_BASE_URL  (default: https://packing-system-production.up.railway.app)
 *   SCREENSHOT_API_URL   (default: mismo que base)
 *   SCREENSHOT_USER      (default: admin)
 *   SCREENSHOT_PASS      (default: admin123)
 *   SCREENSHOT_OUT       (default: screenshots-pinebloom)
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const base = (process.env.SCREENSHOT_BASE_URL || 'https://packing-system-production.up.railway.app').replace(/\/$/, '');
const apiUrl = (process.env.SCREENSHOT_API_URL || base).replace(/\/$/, '');
const user = process.env.SCREENSHOT_USER || 'admin';
const pass = process.env.SCREENSHOT_PASS || 'admin123';
const outRoot = process.env.SCREENSHOT_OUT || join(root, 'screenshots-pinebloom');

const DIRS = {
  d01: '01_dashboard',
  d02: '02_operacion',
  d03: '03_comercial_logistica',
  d04: '04_analisis_reportes',
  d05: '05_packaging',
  d06: '06_planta_datos',
  d07: '07_navegacion_general',
  d08: '08_admin',
};

const log = [];
function record(file, ok, note = '') {
  log.push({ file, ok, note });
  const mark = ok ? '✓' : '✗';
  console.log(`  ${mark} ${file}${note ? ` — ${note}` : ''}`);
}

async function ensureDirs() {
  for (const d of Object.values(DIRS)) {
    await mkdir(join(outRoot, d), { recursive: true });
  }
}

function pathFor(dir, file) {
  return join(outRoot, dir, file);
}

async function loginApi() {
  const loginRes = await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
  });
  if (!loginRes.ok) {
    const t = await loginRes.text();
    return { token: null, error: `Login API ${loginRes.status}: ${t.slice(0, 200)}` };
  }
  const body = await loginRes.json();
  if (!body.access_token) return { token: null, error: 'Login API no devolvió access_token' };
  return { token: body.access_token, error: null };
}

/** Login por formulario SPA cuando la API rechaza credenciales de dev. */
async function loginViaForm(page) {
  await page.goto(`${base}/#/login`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.evaluate(() => {
    localStorage.setItem('lang', 'es');
  });
  await page.waitForSelector('#username', { timeout: 30_000 });
  await page.fill('#username', user);
  await page.fill('#password', pass);
  await page.getByRole('button', { name: /entrar|sign in|login/i }).click();
  await page.waitForFunction(() => !window.location.hash.includes('login'), null, { timeout: 45_000 });
  await page.waitForTimeout(1500);
  const token = await page.evaluate(() => localStorage.getItem('ps_token'));
  if (!token) throw new Error('Login formulario OK en UI pero sin ps_token en localStorage');
  return token;
}

async function fetchJson(token, path) {
  const r = await fetch(`${apiUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  if (!r.ok) return null;
  return r.json();
}

async function resolveIds(token) {
  const receptions = (await fetchJson(token, '/api/receptions')) ?? [];
  const processes = (await fetchJson(token, '/api/processes')) ?? [];
  const ptTags = (await fetchJson(token, '/api/pt-tags')) ?? [];
  const dispatches = (await fetchJson(token, '/api/dispatches')) ?? [];
  const orders = (await fetchJson(token, '/api/sales-orders')) ?? [];
  const producers = (await fetchJson(token, '/api/masters/producers?include_inactive=true')) ?? [];

  const pick = (arr, pred) => arr.find(pred) ?? arr[0];

  const reception = pick(receptions, (r) => {
    const c = r.document_state?.codigo ?? '';
    return c === 'cerrado' || c === 'confirmado';
  });

  const process = pick(processes, (p) => p.packout_lb != null || p.total_packout_lb != null);

  const ptTag = pick(ptTags, (t) => (t.total_cajas ?? 0) > 0);

  const dispatch = pick(dispatches, (d) => d.id);

  const order = pick(orders, (o) => o.id);

  const producer = pick(producers, (p) => p.activo !== false);

  return {
    receptionId: reception?.id ?? null,
    processId: process?.id ?? null,
    ptTagId: ptTag?.id ?? null,
    dispatchId: dispatch?.id ?? null,
    orderId: order?.id ?? null,
    producerId: producer?.id ?? null,
  };
}

async function authenticatePage(page, token) {
  if (token) {
    await page.goto(`${base}/#/login`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.evaluate(
      ({ t, lang }) => {
        localStorage.setItem('ps_token', t);
        localStorage.setItem('lang', lang);
      },
      { t: token, lang: 'es' },
    );
    await page.reload({ waitUntil: 'networkidle', timeout: 90_000 });
    await page.waitForTimeout(1200);
    return;
  }
  await loginViaForm(page);
}

async function gotoHash(page, hashPath, waitMs = 2500) {
  await page.goto(`${base}/#${hashPath}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForTimeout(waitMs);
}

async function shotFull(page, dir, file) {
  const p = pathFor(dir, file);
  try {
    await page.screenshot({ path: p, fullPage: true });
    record(file, true);
    return true;
  } catch (e) {
    record(file, false, e.message);
    return false;
  }
}

async function shotLocator(locator, dir, file) {
  const p = pathFor(dir, file);
  try {
    await locator.scrollIntoViewIfNeeded({ timeout: 15_000 }).catch(() => {});
    await locator.screenshot({ path: p, timeout: 20_000 });
    record(file, true);
    return true;
  } catch (e) {
    record(file, false, e.message);
    return false;
  }
}

async function shotSectionByHeading(page, heading, dir, file) {
  const h = page.getByRole('heading', { name: heading }).first();
  const section = h.locator('xpath=ancestor::section[1]');
  return shotLocator(section, dir, file);
}

async function clickButton(page, name) {
  const btn = page.getByRole('button', { name, exact: false }).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(600);
    return true;
  }
  return false;
}

async function setupDashboardFilters(page) {
  await gotoHash(page, '/');
  await clickButton(page, 'Acumulado');
  // selects: keep defaults (all producers, all fruit, both)
  await page.waitForTimeout(2000);
}

const PDFJS_LEGACY = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.min.js';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js';

/** PDF → PNG vía PDF.js (el <embed> nativo falla con "Couldn't load plugin" en headless). */
async function shotPdf(context, token, apiPath, dir, file) {
  const p = pathFor(dir, file);
  try {
    const res = await fetch(`${base}${apiPath}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' },
    });
    if (!res.ok) {
      record(file, false, `HTTP ${res.status}`);
      return false;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500) {
      record(file, false, `PDF ${buf.length} B`);
      return false;
    }

    const pdfPage = await context.newPage();
    try {
      await pdfPage.setViewportSize({ width: 920, height: 1280 });
      await pdfPage.setContent('<!DOCTYPE html><html><head></head><body style="margin:0;background:#fff"></body></html>', {
        waitUntil: 'load',
      });
      await pdfPage.addScriptTag({ url: PDFJS_LEGACY });
      await pdfPage.waitForFunction(() => typeof window.pdfjsLib !== 'undefined', null, { timeout: 30_000 });
      await pdfPage.evaluate(
        async ({ bytes, workerSrc }) => {
          const pdfjsLib = window.pdfjsLib;
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
          const data = Uint8Array.from(bytes);
          const pdf = await pdfjsLib.getDocument({ data }).promise;
          const pg = await pdf.getPage(1);
          const viewport = pg.getViewport({ scale: 1.4 });
          const canvas = document.createElement('canvas');
          canvas.id = 'pdf-canvas';
          document.body.style.background = '#ffffff';
          document.body.appendChild(canvas);
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          await pg.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        },
        { bytes: [...buf], workerSrc: PDFJS_WORKER },
      );
      await pdfPage.locator('#pdf-canvas').screenshot({ path: p });
      record(file, true);
      return true;
    } finally {
      await pdfPage.close();
    }
  } catch (e) {
    record(file, false, e.message);
    return false;
  }
}

async function captureGroup01(page) {
  const dir = DIRS.d01;
  await setupDashboardFilters(page);
  try {
    const received = page.getByText('Total recibido', { exact: false }).first();
    await received.waitFor({ state: 'visible', timeout: 25_000 });
    await received.scrollIntoViewIfNeeded();
    const box = await received.boundingBox();
    if (box) {
      const y = Math.max(0, box.y - 48);
      await page.screenshot({
        path: pathFor(dir, '01_dashboard_kpis_acumulado.png'),
        clip: { x: 0, y, width: 1440, height: Math.min(720, 900 - y) },
      });
      record('01_dashboard_kpis_acumulado.png', true);
    } else {
      await shotFull(page, dir, '01_dashboard_kpis_acumulado.png');
    }
  } catch (e) {
    record('01_dashboard_kpis_acumulado.png', false, e.message);
  }

  await shotSectionByHeading(page, /Recibido vs empacado/i, dir, '01_dashboard_grafico_recibido_empacado.png');
  const chartSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Por semana' }) }).first();
  if (await chartSelect.isVisible().catch(() => false)) {
    await chartSelect.selectOption({ label: 'Por semana (lun–dom)' }).catch(() =>
      chartSelect.selectOption('week'),
    );
    await page.waitForTimeout(1500);
    await shotSectionByHeading(page, /Recibido vs empacado/i, dir, '01_dashboard_grafico_recibido_empacado.png');
  }

  await shotSectionByHeading(page, /Producción por cliente/i, dir, '01_dashboard_produccion_clientes.png');
  await shotSectionByHeading(page, /Avance de pedidos pendientes/i, dir, '01_dashboard_avance_pedidos.png');

  const alerts = page.getByRole('heading', { name: 'Alertas' }).first();
  const quick = page.getByRole('heading', { name: 'Accesos rápidos' }).first();
  try {
    await alerts.scrollIntoViewIfNeeded();
    const box = await alerts.boundingBox();
    const box2 = await quick.boundingBox();
    if (box && box2) {
      const y = Math.min(box.y, box2.y);
      const h = Math.max(box.y + box.height, box2.y + box2.height) - y + 20;
      await page.screenshot({
        path: pathFor(dir, '01_dashboard_alertas_accesos.png'),
        clip: { x: 0, y, width: 1440, height: Math.min(h, 900) },
      });
      record('01_dashboard_alertas_accesos.png', true);
    }
  } catch (e) {
    record('01_dashboard_alertas_accesos.png', false, e.message);
  }

  const tripaje = page.getByRole('heading', { name: /Recursos de tripaje/i }).first();
  const cap = page.getByRole('heading', { name: /Capacidad por formato/i }).first();
  try {
    await tripaje.scrollIntoViewIfNeeded();
    const box = await tripaje.boundingBox();
    const box2 = await cap.boundingBox();
    if (box && box2) {
      const y = Math.min(box.y, box2.y);
      const h = Math.max(box.y + box.height, box2.y + box2.height) - y + 24;
      await page.screenshot({
        path: pathFor(dir, '01_dashboard_tripaje_capacidad.png'),
        clip: { x: 0, y, width: 1440, height: Math.min(h, 1200) },
      });
      record('01_dashboard_tripaje_capacidad.png', true);
    }
  } catch (e) {
    record('01_dashboard_tripaje_capacidad.png', false, e.message);
  }
}

async function captureGroup02(page, context, token, ids) {
  const dir = DIRS.d02;

  await gotoHash(page, '/receptions');
  await clickButton(page, 'Detallada');
  await page.waitForTimeout(1500);
  await shotFull(page, dir, '02_recepciones_lista_kpis.png');

  const expandBtn = page.locator('button').filter({ has: page.locator('svg') }).nth(0);
  const chevron = page.getByRole('button').filter({ hasText: '' }).first();
  try {
    const rowBtn = page.locator('table tbody tr').first().getByRole('button').first();
    if (await rowBtn.isVisible().catch(() => false)) {
      await rowBtn.click();
      await page.waitForTimeout(800);
    }
  } catch {
    /* optional */
  }
  await shotFull(page, dir, '02_recepcion_detalle_expandido.png');

  if (ids.receptionId) {
    await shotPdf(
      context,
      token,
      `/api/documents/receptions/${ids.receptionId}/pdf?lang=es`,
      dir,
      '02_recepcion_pdf_fruit_record.png',
    );
  } else {
    record('02_recepcion_pdf_fruit_record.png', false, 'sin recepción');
  }

  await gotoHash(page, '/processes');
  await shotFull(page, dir, '02_procesos_lista_packout.png');

  if (ids.processId) {
    await gotoHash(page, `/processes?processId=${ids.processId}`);
    await page.waitForTimeout(2000);
    const editBtn = page.getByRole('button', { name: /editar|modificar|pencil/i }).first();
    if (await editBtn.isVisible().catch(() => false)) {
      await editBtn.click();
      await page.waitForTimeout(1500);
    }
    await shotFull(page, dir, '02_proceso_detalle_liquidacion.png');
    await shotPdf(
      context,
      token,
      `/api/documents/processes/${ids.processId}/pdf?lang=es`,
      dir,
      '02_proceso_pdf_technical_settlement.png',
    );
  } else {
    record('02_proceso_detalle_liquidacion.png', false, 'sin proceso');
    record('02_proceso_pdf_technical_settlement.png', false, 'sin proceso');
  }

  await gotoHash(page, '/pt-tags');
  await shotFull(page, dir, '02_unidades_pt_lista.png');

  if (ids.ptTagId) {
    await shotPdf(
      context,
      token,
      `/api/documents/pt-tags/${ids.ptTagId}/pdf?variant=etiqueta&lang=es`,
      dir,
      '02_tarja_etiqueta_zebra_preview.png',
    );
    await shotPdf(
      context,
      token,
      `/api/documents/pt-tags/${ids.ptTagId}/pdf?lang=es`,
      dir,
      '02_tarja_pdf_trazabilidad.png',
    );
  } else {
    record('02_tarja_etiqueta_zebra_preview.png', false, 'sin tarja');
    record('02_tarja_pdf_trazabilidad.png', false, 'sin tarja');
  }

  await gotoHash(page, '/existencias-pt/inventario');
  await shotFull(page, dir, '02_existencias_inventario_camara.png');

  await gotoHash(page, '/existencias-pt/repaletizar');
  await shotFull(page, dir, '02_existencias_repaletizaje.png');

  await gotoHash(page, '/existencias-pt/packing-lists');
  await shotFull(page, dir, '02_existencias_packing_lists_pt.png');
}

async function captureGroup03(page, context, token, ids) {
  const dir = DIRS.d03;

  await gotoHash(page, '/sales-orders');
  await shotFull(page, dir, '03_pedidos_lista_comercial.png');

  if (ids.orderId) {
    await gotoHash(page, `/sales-orders/${ids.orderId}/avance`);
    await shotFull(page, dir, '03_pedido_avance_detalle.png');
  } else {
    record('03_pedido_avance_detalle.png', false, 'sin pedido');
  }

  await gotoHash(page, '/dispatches');
  await shotFull(page, dir, '03_despachos_lista_estados.png');

  if (ids.dispatchId) {
    await shotPdf(
      context,
      token,
      `/api/documents/dispatches/${ids.dispatchId}/bol/pdf?lang=es`,
      dir,
      '03_despacho_pdf_bol.png',
    );
    await shotPdf(
      context,
      token,
      `/api/documents/dispatches/${ids.dispatchId}/invoice/pdf?lang=en`,
      dir,
      '03_despacho_pdf_factura_comercial.png',
    );
    await shotPdf(
      context,
      token,
      `/api/documents/dispatches/${ids.dispatchId}/packing-list/pdf?lang=es`,
      dir,
      '03_despacho_pdf_packing_list.png',
    );
  } else {
    record('03_despacho_pdf_bol.png', false, 'sin despacho');
    record('03_despacho_pdf_factura_comercial.png', false, 'sin despacho');
    record('03_despacho_pdf_packing_list.png', false, 'sin despacho');
  }
}

async function captureGroup04(page, context, token, ids) {
  const dir = DIRS.d04;
  await gotoHash(page, '/reporting', 3000);

  await clickButton(page, 'Operación');
  await page.waitForTimeout(2000);
  await shotFull(page, dir, '04_reportes_operacion_eod.png');

  await clickButton(page, 'Decisión');
  await page.waitForTimeout(2000);
  await shotFull(page, dir, '04_reportes_decision_planificacion.png');

  await clickButton(page, 'Cierre');
  await page.waitForTimeout(1000);
  const actualizar = page.getByRole('button', { name: /Actualizar cierre/i }).first();
  if (await actualizar.isVisible().catch(() => false)) {
    await actualizar.click();
    await page.waitForTimeout(5000);
  }

  await clickButton(page, 'Liquidación global');
  await page.waitForTimeout(1500);
  await shotFull(page, dir, '04_reportes_cierre_liquidacion_global.png');

  await clickButton(page, 'Por productor');
  await page.waitForTimeout(1000);
  if (ids.producerId) {
    const sel = page.locator('select').filter({ has: page.locator('option') }).last();
    await sel.selectOption(String(ids.producerId)).catch(() => {});
    await page.waitForTimeout(1500);
  }
  await clickButton(page, /Real \(interno\)/i);
  await page.waitForTimeout(1000);
  await shotFull(page, dir, '04_reportes_cierre_productor_toggle.png');

  if (ids.producerId) {
    const y = new Date().getFullYear();
    const q = new URLSearchParams({
      variant: 'producer',
      productor_id: String(ids.producerId),
      fecha_desde: `${y}-01-01`,
      fecha_hasta: `${y}-12-31`,
      page: '1',
      limit: '100',
      lang: 'es',
    });
    await shotPdf(
      context,
      token,
      `/api/reporting/producer-settlement/pdf?${q}`,
      dir,
      '04_liquidacion_productor_pdf.png',
    );
  } else {
    record('04_liquidacion_productor_pdf.png', false, 'sin productor');
  }

  await clickButton(page, 'Documentos');
  await page.waitForTimeout(2500);
  await shotFull(page, dir, '04_reportes_documentos_balance_masas.png');
  await shotFull(page, dir, '04_reportes_documentos_excel_descarga.png');
}

async function captureGroup05(page) {
  const dir = DIRS.d05;
  await gotoHash(page, '/packaging/materials');
  await shotFull(page, dir, '05_packaging_materiales_inventario.png');

  await gotoHash(page, '/packaging/kardex');
  await page.waitForTimeout(2000);
  await shotFull(page, dir, '05_packaging_kardex_movimientos.png');

  await gotoHash(page, '/packaging/recipes');
  await shotFull(page, dir, '05_packaging_recetas_formatos.png');

  await gotoHash(page, '/packaging/consumptions');
  await shotFull(page, dir, '05_packaging_consumos_capacidad.png');
}

async function captureGroup06(page) {
  const dir = DIRS.d06;
  await gotoHash(page, '/masters');
  await clickButton(page, /Formatos/i);
  await page.waitForTimeout(1500);
  await shotFull(page, dir, '06_mantenedores_formatos.png');

  await clickButton(page, 'Productores');
  await page.waitForTimeout(1500);
  await shotFull(page, dir, '06_mantenedores_productores.png');

  await gotoHash(page, '/plant');
  await shotFull(page, dir, '06_planta_configuracion.png');
}

async function captureGroup07(page, context, token) {
  const dir = DIRS.d07;

  await gotoHash(page, '/receptions');
  const aside = page.locator('aside').first();
  try {
    await aside.evaluate((el) => {
      el.scrollTop = 0;
    });
    await shotLocator(aside, dir, '07_sidebar_completo_superior.png');
    await aside.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(400);
    await shotLocator(aside, dir, '07_sidebar_completo_inferior.png');
  } catch (e) {
    record('07_sidebar_completo_superior.png', false, e.message);
    record('07_sidebar_completo_inferior.png', false, e.message);
  }

  try {
    const header = page.locator('aside').locator('a').first();
    await shotLocator(page.locator('aside').locator('div').first(), dir, '07_header_logo_pinebloom.png');
  } catch (e) {
    record('07_header_logo_pinebloom.png', false, e.message);
  }

  await setupDashboardFilters(page);
  await shotFull(page, dir, '07_idioma_es_dashboard.png');

  await page.evaluate(() => {
    localStorage.setItem('lang', 'en');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const enTitle = page.getByRole('heading', { name: /Operational home|Inicio operativo/i }).first();
  if (await enTitle.isVisible().catch(() => false)) {
    await shotFull(page, dir, '07_idioma_en_dashboard.png');
  } else {
    await shotFull(page, dir, '07_idioma_en_dashboard.png');
  }
  await page.evaluate(() => localStorage.setItem('lang', 'es'));
  await page.reload({ waitUntil: 'networkidle' });

  await gotoHash(page, '/guide/sistema');
  await shotFull(page, dir, '07_guia_del_sistema.png');

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 393, height: 852 });
  await mobile.goto(`${base}/#/`, { waitUntil: 'domcontentloaded' });
  await mobile.evaluate(
    ({ t, lang }) => {
      localStorage.setItem('ps_token', t);
      localStorage.setItem('lang', lang);
    },
    { t: token, lang: 'es' },
  );
  await mobile.reload({ waitUntil: 'networkidle' });
  await mobile.waitForTimeout(2000);
  await mobile.screenshot({ path: pathFor(dir, '07_movil_dashboard_responsive.png'), fullPage: true });
  record('07_movil_dashboard_responsive.png', true);
  const menuBtn = mobile.getByRole('button', { name: 'Menú' });
  if (await menuBtn.isVisible().catch(() => false)) {
    await menuBtn.click();
    await mobile.waitForTimeout(600);
    await mobile.screenshot({ path: pathFor(dir, '07_movil_menu_abierto.png'), fullPage: true });
    record('07_movil_menu_abierto.png', true);
  } else {
    record('07_movil_menu_abierto.png', false, 'botón Menú no visible');
  }
  await mobile.close();

  const loginPage = await context.newPage();
  await loginPage.setViewportSize({ width: 1440, height: 900 });
  await loginPage.goto(`${base}/#/login`, { waitUntil: 'networkidle' });
  await loginPage.evaluate(() => localStorage.removeItem('ps_token'));
  await loginPage.reload({ waitUntil: 'networkidle' });
  await loginPage.waitForTimeout(800);
  await loginPage.screenshot({ path: pathFor(dir, '07_pantalla_login.png'), fullPage: true });
  record('07_pantalla_login.png', true);
  await loginPage.close();
}

async function captureGroup08(page) {
  const dir = DIRS.d08;
  await gotoHash(page, '/bulk-import');
  await shotFull(page, dir, '08_admin_carga_masiva.png');
}

async function main() {
  await ensureDirs();
  console.log(`Base: ${base}`);
  console.log(`Salida: ${outRoot}\n`);

  const { token: apiToken, error: loginErr } = await loginApi();
  if (loginErr) {
    console.warn(`API login falló (${loginErr}). Se usará login por formulario.`);
    console.warn('Definí SCREENSHOT_USER y SCREENSHOT_PASS con credenciales de producción.\n');
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'es-AR',
    colorScheme: 'light',
    ...(apiToken ? { extraHTTPHeaders: { Authorization: `Bearer ${apiToken}` } } : {}),
  });
  const page = await context.newPage();

  await authenticatePage(page, apiToken);
  const token = apiToken || (await page.evaluate(() => localStorage.getItem('ps_token')));
  if (!token) throw new Error('No se obtuvo token de sesión');

  if (!apiToken) {
    await context.setExtraHTTPHeaders({ Authorization: `Bearer ${token}` });
  }

  const ids = await resolveIds(token);
  console.log('IDs resueltos:', ids);

  console.log('\n— Grupo 01 Dashboard —');
  await captureGroup01(page);

  console.log('\n— Grupo 02 Operación —');
  await captureGroup02(page, context, token, ids);

  console.log('\n— Grupo 03 Comercial —');
  await captureGroup03(page, context, token, ids);

  console.log('\n— Grupo 04 Reportes —');
  await captureGroup04(page, context, token, ids);

  console.log('\n— Grupo 05 Packaging —');
  await captureGroup05(page);

  console.log('\n— Grupo 06 Planta y datos —');
  await captureGroup06(page);

  console.log('\n— Grupo 07 Navegación —');
  await captureGroup07(page, context, token);

  console.log('\n— Grupo 08 Admin —');
  await captureGroup08(page);

  await browser.close();

  const ok = log.filter((x) => x.ok).length;
  const fail = log.filter((x) => !x.ok).length;
  const summary = { generatedAt: new Date().toISOString(), base, ok, fail, items: log };
  await writeFile(join(outRoot, 'manifest.json'), JSON.stringify(summary, null, 2));

  console.log(`\nListo: ${ok} OK, ${fail} fallidos → ${outRoot}`);
  console.log(`Manifest: ${join(outRoot, 'manifest.json')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

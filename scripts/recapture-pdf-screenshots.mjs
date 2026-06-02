/**
 * Re-captura solo PNGs de PDFs (PDF.js en Chromium — evita "Couldn't load plugin").
 *
 *   SCREENSHOT_USER=admin SCREENSHOT_PASS=... node scripts/recapture-pdf-screenshots.mjs
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
const pass = process.env.SCREENSHOT_PASS || '';
const SHOTS_ROOT = join(root, 'screenshots-pinebloom');

const PDFJS_LEGACY = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.min.js';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js';

async function loginApi() {
  const loginRes = await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
  });
  if (!loginRes.ok) throw new Error(`Login ${loginRes.status}: ${(await loginRes.text()).slice(0, 200)}`);
  const body = await loginRes.json();
  if (!body.access_token) throw new Error('Sin access_token');
  return body.access_token;
}

async function fetchIds(token) {
  const receptions = (await fetchJson(token, '/api/receptions')) ?? [];
  const dispatches = (await fetchJson(token, '/api/dispatches')) ?? [];
  const producers = (await fetchJson(token, '/api/masters/producers?include_inactive=true')) ?? [];
  const ptTags = (await fetchJson(token, '/api/pt-tags')) ?? [];
  const pick = (arr, pred) => arr.find(pred) ?? arr[0];
  const reception = pick(receptions, (r) => {
    const c = r.document_state?.codigo ?? '';
    return c === 'cerrado' || c === 'confirmado';
  });
  const dispatch = pick(dispatches, (d) => d.id);
  const producer = pick(producers, (p) => p.activo !== false);
  const ptTag = pick(ptTags, (t) => t.id) ?? ptTags[0];
  return {
    receptionId: reception?.id,
    dispatchId: dispatch?.id,
    producerId: producer?.id,
    ptTagId: ptTag?.id,
  };
}

async function fetchJson(token, path) {
  const r = await fetch(`${apiUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  if (!r.ok) return null;
  return r.json();
}

/** Renderiza página 1 del PDF a PNG con fondo blanco. */
async function renderPdfPng(context, pdfBytes, outPath) {
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 920, height: 1280 });
    await page.setContent('<!DOCTYPE html><html><head></head><body style="margin:0;background:#fff"></body></html>', {
      waitUntil: 'load',
    });
    await page.addScriptTag({ url: PDFJS_LEGACY });
    await page.waitForFunction(() => typeof window.pdfjsLib !== 'undefined', null, { timeout: 30_000 });

    const size = await page.evaluate(
      async ({ bytes, workerSrc }) => {
        const pdfjsLib = window.pdfjsLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
        const data = Uint8Array.from(bytes);
        const pdf = await pdfjsLib.getDocument({ data }).promise;
        const pg = await pdf.getPage(1);
        const scale = 1.4;
        const viewport = pg.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.id = 'pdf-canvas';
        document.body.style.background = '#ffffff';
        document.body.appendChild(canvas);
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await pg.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        return { w: canvas.width, h: canvas.height };
      },
      { bytes: [...pdfBytes], workerSrc: PDFJS_WORKER },
    );

    if (!size?.w || !size?.h) throw new Error('PDF.js no renderizó canvas');
    await page.locator('#pdf-canvas').screenshot({ path: outPath });
    return size;
  } finally {
    await page.close();
  }
}

async function fetchPdfBytes(token, apiPath) {
  const res = await fetch(`${base}${apiPath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' },
  });
  if (!res.ok) throw new Error(`PDF HTTP ${res.status} ${apiPath}`);
  const ct = res.headers.get('Content-Type') ?? '';
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) throw new Error(`PDF demasiado chico (${buf.length} B): ${apiPath}`);
  if (!ct.includes('pdf') && buf[0] !== 0x25) {
    throw new Error(`No es PDF: ${buf.slice(0, 80).toString()}`);
  }
  return buf;
}

async function captureOne(context, token, apiPath, relPath) {
  const outPath = join(SHOTS_ROOT, relPath);
  await mkdir(dirname(outPath), { recursive: true });
  const bytes = await fetchPdfBytes(token, apiPath);
  const size = await renderPdfPng(context, bytes, outPath);
  console.log(`✓ ${outPath} (${bytes.length} B PDF → ${size.w}×${size.h} px)`);
}

async function main() {
  if (!pass) {
    console.error('Definí SCREENSHOT_PASS (ej. admin de producción).');
    process.exit(1);
  }
  console.log('SHOTS_ROOT =', SHOTS_ROOT);

  const token = await loginApi();
  const ids = await fetchIds(token);
  console.log('IDs:', ids);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  await captureOne(
    context,
    token,
    `/api/documents/receptions/${ids.receptionId}/pdf?lang=es`,
    '02_operacion/02_recepcion_pdf_fruit_record.png',
  );
  await captureOne(
    context,
    token,
    `/api/documents/dispatches/${ids.dispatchId}/bol/pdf?lang=es`,
    '03_comercial_logistica/03_despacho_pdf_bol.png',
  );
  await captureOne(
    context,
    token,
    `/api/documents/dispatches/${ids.dispatchId}/invoice/pdf?lang=en`,
    '03_comercial_logistica/03_despacho_pdf_factura_comercial.png',
  );

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
  await captureOne(
    context,
    token,
    `/api/reporting/producer-settlement/pdf?${q}`,
    '04_analisis_reportes/04_liquidacion_productor_pdf.png',
  );

  if (ids.ptTagId) {
    await captureOne(
      context,
      token,
      `/api/documents/pt-tags/${ids.ptTagId}/pdf?variant=etiqueta&lang=es`,
      '02_operacion/02_tarja_etiqueta_zebra_preview.png',
    );
  } else {
    console.warn('⚠ sin ptTagId — omitiendo 02_tarja_etiqueta_zebra_preview.png');
  }

  await browser.close();
  console.log('\nListo — PDFs re-capturados con PDF.js');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

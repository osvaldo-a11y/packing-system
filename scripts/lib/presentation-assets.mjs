import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, '..', '..');
export const SHOTS_ROOT = join(REPO_ROOT, 'screenshots-pinebloom');
export const OUT_DIR = join(REPO_ROOT, 'docs', 'presentacion-comercial');

/** @type {import('pptxgenjs').default} */
export const ShapeType = { rect: 'rect', roundRect: 'roundRect' };

export const COLORS = {
  navy: '1A3A5C',
  navyDark: '0F2438',
  green: '1D9E75',
  greenLight: 'E1F5EE',
  slate900: '0F172A',
  slate600: '475569',
  slate400: '94A3B8',
  slate200: 'E2E8F0',
  pdfPlaceholder: 'FFFFFF',
  white: 'FFFFFF',
  amber: 'D97706',
};

export const LAYOUT = {
  /** Texto izquierda + imagen derecha */
  rightPanel: { x: 5.4, y: 2.0, w: 4.2, h: 3.3 },
  rightPanelTall: { x: 5.35, y: 1.45, w: 4.35, h: 4.05 },
  rightHalfTop: { x: 5.2, y: 1.15, w: 4.55, h: 2.05 },
  rightHalfBottom: { x: 5.2, y: 3.35, w: 4.55, h: 2.05 },
  rightTextPanel: { x: 5.2, y: 1.8, w: 4.4, h: 3.4 },
  stackDashboard: { x: 5.0, y: 3.1, w: 4.6, h: 2.2 },
  ghostBg: { x: 0, y: 0, w: 10, h: 5.625 },
};

/**
 * @param {string} rel — ej. `01_dashboard/01_dashboard_kpis_acumulado.png`
 */
export function shot(rel) {
  const full = join(SHOTS_ROOT, ...rel.replace(/\\/g, '/').split('/'));
  if (!existsSync(full)) {
    throw new Error(`Captura no encontrada: ${full}`);
  }
  return full;
}

/**
 * @param {import('pptxgenjs').Slide} s
 * @param {{ path: string, x: number, y: number, w: number, h: number, transparency?: number }} opts
 */
export function addImageContain(s, opts) {
  const { path, x, y, w, h, transparency } = opts;
  /** @type {import('pptxgenjs').ImageProps} */
  const img = { path, x, y, w, h, sizing: { type: 'contain', w, h } };
  if (transparency != null) img.transparency = transparency;
  s.addImage(img);
}

/**
 * Panel: fondo → imagen (contain) → borde. El rect NO va encima opaco (evita bloques grises).
 * @param {import('pptxgenjs').Slide} s
 */
export function addPanelImage(s, opts) {
  const { path, x, y, w, h, transparency, pdf = false } = opts;
  s.addShape(ShapeType.rect, {
    x,
    y,
    w,
    h,
    fill: { color: pdf ? COLORS.pdfPlaceholder : 'F8FAFC' },
    line: { color: pdf ? COLORS.navy : COLORS.slate200, pt: pdf ? 2 : 1 },
    shadow: pdf
      ? undefined
      : { type: 'outer', blur: 8, offset: 3, angle: 135, color: '000000', opacity: 0.12 },
  });
  addImageContain(s, { path, x, y, w, h, transparency });
}

/** Capturas de PDF renderizadas (fondo blanco del visor). */
export function addPdfFramedImage(s, opts) {
  addPanelImage(s, { ...opts, pdf: true });
}

/**
 * @param {import('pptxgenjs').Slide} s
 */
export function addFramedImage(s, opts) {
  addPanelImage(s, opts);
}

/**
 * @param {import('pptxgenjs').Slide} s
 */
export function slideHeader(s, { title, subtitle, dark = false }) {
  const titleColor = dark ? COLORS.white : COLORS.navy;
  const subColor = dark ? 'CBD5E1' : COLORS.slate600;
  s.addText(title, {
    x: 0.55,
    y: 0.42,
    w: 8.8,
    h: 0.65,
    fontSize: 28,
    bold: true,
    color: titleColor,
    fontFace: 'Segoe UI',
  });
  if (subtitle) {
    s.addText(subtitle, {
      x: 0.55,
      y: 1.05,
      w: 4.6,
      h: 0.55,
      fontSize: 13,
      color: subColor,
      fontFace: 'Segoe UI',
    });
  }
}

/**
 * Fondo oscuro para portada / cierre.
 * @param {import('pptxgenjs').Slide} s
 */
export function darkSlideBg(s) {
  s.addShape(ShapeType.rect, {
    x: 0,
    y: 0,
    w: 10,
    h: 5.625,
    fill: { color: COLORS.navyDark },
    line: { color: COLORS.navyDark, transparency: 100 },
  });
  s.addShape(ShapeType.rect, {
    x: 6.8,
    y: -0.5,
    w: 4.5,
    h: 4.5,
    fill: { color: COLORS.green, transparency: 88 },
    line: { transparency: 100 },
  });
}

/** 5 pasos trazabilidad (imágenes pequeñas bajo cada paso). */
export const TRACE_SHOTS = [
  { rel: '02_operacion/02_recepciones_lista_kpis.png', labelEn: '1 · Reception', labelEs: '1 · Recepción' },
  { rel: '02_operacion/02_procesos_lista_packout.png', labelEn: '2 · Process', labelEs: '2 · Proceso' },
  { rel: '02_operacion/02_unidades_pt_lista.png', labelEn: '3 · PT unit', labelEs: '3 · Unidad PT' },
  { rel: '03_comercial_logistica/03_despachos_lista_estados.png', labelEn: '4 · Dispatch', labelEs: '4 · Despacho' },
  {
    rel: '04_analisis_reportes/04_reportes_cierre_productor_toggle.png',
    labelEn: '5 · Settlement',
    labelEs: '5 · Liquidación',
  },
];

/**
 * @param {import('pptxgenjs').Slide} s
 * @param {'en'|'es'} lang
 */
export function addTraceabilityRow(s, lang) {
  const imgW = 1.72;
  const imgH = 2.8;
  const imgY = 2.3;
  const gap = 0.18;
  const xs = TRACE_SHOTS.map((_, i) => 0.35 + i * (imgW + gap));
  TRACE_SHOTS.forEach((step, i) => {
    const label = lang === 'en' ? step.labelEn : step.labelEs;
    s.addText(label, {
      x: xs[i],
      y: 1.28,
      w: imgW,
      h: 0.38,
      fontSize: 11,
      bold: true,
      color: COLORS.navy,
      align: 'center',
      fontFace: 'Segoe UI',
    });
    addPanelImage(s, {
      path: shot(step.rel),
      x: xs[i],
      y: imgY,
      w: imgW,
      h: imgH,
    });
  });
}

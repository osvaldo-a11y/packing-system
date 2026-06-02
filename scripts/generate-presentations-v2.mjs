/**
 * Genera presentaciones comerciales v2 con capturas reales.
 *
 *   npm run presentations:v2
 *
 * Salida:
 *   docs/presentacion-comercial/Pinebloom_Packing_System_EN_v2.pptx
 *   docs/presentacion-comercial/Pinebloom_Packing_System_ES_v2.pptx
 */
import { existsSync, statSync } from 'fs';
import { mkdir } from 'fs/promises';
import pptxgen from 'pptxgenjs';
import { join } from 'path';
import {
  COLORS,
  LAYOUT,
  OUT_DIR,
  SHOTS_ROOT,
  ShapeType,
  addFramedImage,
  addImageContain,
  addPdfFramedImage,
  addTraceabilityRow,
  darkSlideBg,
  shot,
  slideHeader,
} from './lib/presentation-assets.mjs';

/** @param {import('pptxgenjs').default} pres */
function newSlide(pres) {
  const s = pres.addSlide();
  s.background = { color: COLORS.white };
  return s;
}

/** Ruta absoluta a captura de PDF bajo screenshots-pinebloom */
function pdfPath(folder, filename) {
  const full = join(SHOTS_ROOT, folder, filename);
  if (!existsSync(full)) {
    throw new Error(`Captura PDF no encontrada: ${full}`);
  }
  return full;
}

function buildEN(pres) {
  // —— Slide 1 Cover ——
  {
    const s = newSlide(pres);
    darkSlideBg(s);
    s.addText('Pinebloom Packing System', {
      x: 0.55,
      y: 0.75,
      w: 4.8,
      h: 0.9,
      fontSize: 34,
      bold: true,
      color: COLORS.white,
      fontFace: 'Segoe UI',
    });
    s.addText('Operational platform for fruit packing plants', {
      x: 0.55,
      y: 1.65,
      w: 4.5,
      h: 0.5,
      fontSize: 14,
      color: 'CBD5E1',
      fontFace: 'Segoe UI',
    });
    addImageContain(s, {
      path: shot('07_navegacion_general/07_pantalla_login.png'),
      x: 0.45,
      y: 2.15,
      w: 4.35,
      h: 3.15,
      transparency: 8,
    });
    addImageContain(s, {
      path: shot('07_navegacion_general/07_sidebar_completo_superior.png'),
      x: 5.15,
      y: 0.55,
      w: 4.55,
      h: 4.85,
      transparency: 12,
    });
  }

  // —— Slide 2 The Problem ——
  {
    const s = newSlide(pres);
    addImageContain(s, {
      path: shot('01_dashboard/01_dashboard_kpis_acumulado.png'),
      ...LAYOUT.ghostBg,
      transparency: 85,
    });
    slideHeader(s, {
      title: 'The operational gap',
      subtitle: 'Spreadsheets and disconnected tools hide margin and traceability risk.',
    });
    const bullets = [
      'No single source of truth from reception to dispatch',
      'Producer settlement and pack fee buried in manual Excel',
      'Commercial teams lack live order progress vs cooler stock',
      'Documents (BOL, invoice, PL) rebuilt per shipment',
    ];
    s.addText(bullets.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })), {
      x: 0.55,
      y: 1.85,
      w: 4.85,
      h: 3.2,
      fontSize: 14,
      color: COLORS.slate900,
      paraSpaceAfter: 10,
      fontFace: 'Segoe UI',
    });
  }

  // —— Slide 3 Modules ——
  {
    const s = newSlide(pres);
    slideHeader(s, {
      title: 'One system, every module',
      subtitle: 'Plant config, packaging, operations, commercial and analytics.',
    });
    const modules = [
      'Plant & masters — parameters and catalogs',
      'Packaging — materials, kardex, recipes, consumption',
      'Operations — reception, process, PT units, cooler stock',
      'Commercial — orders, dispatches, documents',
      'Analytics — operation, decision, settlement, mass balance',
    ];
    s.addText(modules.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })), {
      x: 0.55,
      y: 1.75,
      w: 4.75,
      h: 3.35,
      fontSize: 13,
      color: COLORS.slate900,
      paraSpaceAfter: 8,
      fontFace: 'Segoe UI',
    });
    addFramedImage(s, {
      path: shot('07_navegacion_general/07_sidebar_completo_superior.png'),
      ...LAYOUT.rightPanel,
    });
  }

  // —— Slide 4 Traceability ——
  {
    const s = newSlide(pres);
    slideHeader(s, {
      title: 'End-to-end traceability',
      subtitle: 'From grower reception to producer settlement — one chain of record.',
    });
    addTraceabilityRow(s, 'en');
  }

  // —— Slide 5 Documents ——
  {
    const s = newSlide(pres);
    slideHeader(s, {
      title: 'Professional documents, one click',
      subtitle: 'Bilingual PDFs aligned with operational data — no copy-paste.',
    });
    addPdfFramedImage(s, {
      path: pdfPath('02_operacion', '02_recepcion_pdf_fruit_record.png'),
      x: 0.45,
      y: 1.75,
      w: 3.05,
      h: 3.45,
    });
    addPdfFramedImage(s, {
      path: pdfPath('03_comercial_logistica', '03_despacho_pdf_bol.png'),
      x: 3.65,
      y: 1.75,
      w: 3.05,
      h: 1.55,
    });
    addPdfFramedImage(s, {
      path: pdfPath('03_comercial_logistica', '03_despacho_pdf_factura_comercial.png'),
      x: 3.65,
      y: 3.45,
      w: 3.05,
      h: 1.75,
    });
    addPdfFramedImage(s, {
      path: pdfPath('04_analisis_reportes', '04_liquidacion_productor_pdf.png'),
      x: 6.85,
      y: 1.75,
      w: 3.05,
      h: 3.45,
    });
  }

  // —— Slide 6 Dashboard ——
  {
    const s = newSlide(pres);
    slideHeader(s, {
      title: 'Operational dashboard in real time',
      subtitle: 'Input, process, output and commercial risk on one screen.',
    });
    s.addText(
      [
        { text: 'Filters: Today / Week / Accumulated', options: { bullet: true } },
        { text: 'KPIs: received, packed, dispatched, balance', options: { bullet: true } },
        { text: 'Order gauges, capacity and alerts', options: { bullet: true } },
      ],
      {
        x: 0.55,
        y: 1.85,
        w: 4.5,
        h: 2.5,
        fontSize: 13,
        color: COLORS.slate900,
        fontFace: 'Segoe UI',
      },
    );
    addFramedImage(s, {
      path: shot('01_dashboard/01_dashboard_kpis_acumulado.png'),
      ...LAYOUT.rightHalfTop,
    });
    addFramedImage(s, {
      path: shot('01_dashboard/01_dashboard_grafico_recibido_empacado.png'),
      ...LAYOUT.rightHalfBottom,
    });
  }

  // —— Slide 7 Cost (no images) ——
  {
    const s = newSlide(pres);
    slideHeader(s, {
      title: 'Cost vs fragmented tools',
      subtitle: 'One platform replaces spreadsheets, ad-hoc reports and document rework.',
    });
    const rows = [
      [
        { text: 'Capability', options: { bold: true, fill: { color: COLORS.navy }, color: COLORS.white } },
        { text: 'Spreadsheets / ERP add-ons', options: { bold: true, fill: { color: COLORS.slate200 } } },
        { text: 'Pinebloom Packing', options: { bold: true, fill: { color: COLORS.greenLight } } },
      ],
      ['Traceability reception → dispatch', 'Manual / partial', 'Native chain + PDFs'],
      ['Producer settlement (pack fee)', 'External Excel', 'Cierre + PDF + Excel'],
      ['Mass balance by producer', 'Rare / custom', 'Documentos tab'],
      ['Bilingual operational UI', 'Usually single language', 'ES / EN toggle'],
      ['Zebra label + QR tarjas', 'Separate tool', 'Built-in PT unit'],
    ];
    s.addTable(rows, {
      x: 0.45,
      y: 1.65,
      w: 9.1,
      h: 3.5,
      fontSize: 11,
      border: { pt: 0.5, color: COLORS.slate200 },
      align: 'left',
      valign: 'middle',
    });
  }

  // —— Slide 8 Advantages ——
  {
    const s = newSlide(pres);
    slideHeader(s, { title: 'Differentiators', subtitle: 'What buyers see on day one.' });
    const cards = [
      { x: 0.45, title: 'QR PT labels', body: 'Zebra-ready tags linked to process & dispatch' },
      { x: 2.55, title: 'Bilingual UI', body: 'Spanish / English for plant and buyers' },
      { x: 4.65, title: 'Mass balance', body: 'Recepción → packout → invoiced lb' },
      { x: 6.75, title: 'Built-in guide', body: 'System documentation inside the app' },
    ];
    for (const c of cards) {
      s.addShape(ShapeType.roundRect, {
        x: c.x,
        y: 1.55,
        w: 1.95,
        h: 1.35,
        fill: { color: COLORS.greenLight },
        line: { color: COLORS.slate200, pt: 0.5 },
        rectRadius: 0.08,
      });
      s.addText(c.title, {
        x: c.x + 0.1,
        y: 1.68,
        w: 1.75,
        h: 0.35,
        fontSize: 11,
        bold: true,
        color: COLORS.navy,
        fontFace: 'Segoe UI',
      });
      s.addText(c.body, {
        x: c.x + 0.1,
        y: 2.05,
        w: 1.75,
        h: 0.75,
        fontSize: 9,
        color: COLORS.slate600,
        fontFace: 'Segoe UI',
      });
    }
    addFramedImage(s, {
      path: slide8EnLeftImage(),
      x: 0.55,
      y: 3.05,
      w: 4.25,
      h: 2.15,
    });
    addFramedImage(s, {
      path: shot('07_navegacion_general/07_idioma_en_dashboard.png'),
      x: 5.15,
      y: 3.05,
      w: 4.25,
      h: 2.15,
    });
  }

  // —— Slide 9 Tech Stack ——
  {
    const s = newSlide(pres);
    slideHeader(s, {
      title: 'Technology stack',
      subtitle: 'Modern, deployable, API-first.',
    });
    s.addText(
      [
        { text: 'Frontend: React + TypeScript + Vite', options: { bullet: true } },
        { text: 'Backend: NestJS + PostgreSQL + TypeORM', options: { bullet: true } },
        { text: 'Auth: JWT roles (admin, supervisor, operator, viewer)', options: { bullet: true } },
        { text: 'Documents: PDFKit — BOL, invoice, settlement, labels', options: { bullet: true } },
        { text: 'Deploy: Railway / Docker-ready', options: { bullet: true } },
      ],
      {
        x: 0.55,
        y: 1.75,
        w: 4.9,
        h: 3.2,
        fontSize: 13,
        color: COLORS.slate900,
        fontFace: 'Segoe UI',
      },
    );
    addFramedImage(s, {
      path: shot('07_navegacion_general/07_header_logo_pinebloom.png'),
      x: 5.35,
      y: 1.35,
      w: 4.35,
      h: 1.1,
    });
    addFramedImage(s, {
      path: shot('07_navegacion_general/07_idioma_en_dashboard.png'),
      ...LAYOUT.stackDashboard,
    });
  }

  // —— Slide 10 Roadmap ——
  {
    const s = newSlide(pres);
    slideHeader(s, { title: 'Roadmap', subtitle: 'Planned enhancements (indicative).' });
    const phases = [
      'Q2 — Mobile scanner workflows for cooler & dispatch',
      'Q3 — ERP / accounting connectors for invoices',
      'Q4 — Advanced planning & yield forecasting',
      'Ongoing — Customer-specific report templates',
    ];
    s.addText(phases.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })), {
      x: 0.55,
      y: 1.85,
      w: 4.5,
      h: 3.2,
      fontSize: 14,
      color: COLORS.slate900,
      fontFace: 'Segoe UI',
    });
    addFramedImage(s, {
      path: shot('04_analisis_reportes/04_reportes_decision_planificacion.png'),
      ...LAYOUT.rightTextPanel,
    });
  }

  // —— Slide 11 CTA ——
  {
    const s = newSlide(pres);
    darkSlideBg(s);
    addImageContain(s, {
      path: shot('01_dashboard/01_dashboard_produccion_clientes.png'),
      x: 0.35,
      y: 0.85,
      w: 4.6,
      h: 4.2,
      transparency: 80,
    });
    s.addText('Ready for a live walkthrough?', {
      x: 5.0,
      y: 1.35,
      w: 4.5,
      h: 0.7,
      fontSize: 30,
      bold: true,
      color: COLORS.white,
      fontFace: 'Segoe UI',
    });
    s.addText('Production demo with your season data.\npacking-system-production.up.railway.app', {
      x: 5.0,
      y: 2.2,
      w: 4.5,
      h: 1.2,
      fontSize: 14,
      color: 'CBD5E1',
      fontFace: 'Segoe UI',
    });
    s.addShape(ShapeType.roundRect, {
      x: 5.0,
      y: 3.65,
      w: 2.4,
      h: 0.55,
      fill: { color: COLORS.green },
      line: { transparency: 100 },
      rectRadius: 0.2,
    });
    s.addText('Schedule demo', {
      x: 5.0,
      y: 3.72,
      w: 2.4,
      h: 0.45,
      fontSize: 13,
      bold: true,
      color: COLORS.white,
      align: 'center',
      fontFace: 'Segoe UI',
    });
  }
}

function buildES(pres) {
  // —— Slide 1 Portada ——
  {
    const s = newSlide(pres);
    darkSlideBg(s);
    s.addText('Pinebloom Packing System', {
      x: 0.55,
      y: 0.85,
      w: 5.0,
      h: 0.85,
      fontSize: 32,
      bold: true,
      color: COLORS.white,
      fontFace: 'Segoe UI',
    });
    s.addText('Panel operativo para planta de empaque de fruta', {
      x: 0.55,
      y: 1.75,
      w: 4.8,
      h: 0.45,
      fontSize: 14,
      color: 'CBD5E1',
      fontFace: 'Segoe UI',
    });
    addImageContain(s, {
      path: shot('07_navegacion_general/07_pantalla_login.png'),
      x: 4.85,
      y: 1.15,
      w: 4.75,
      h: 4.15,
      transparency: 10,
    });
  }

  // —— Slide 2 Qué se construyó ——
  {
    const s = newSlide(pres);
    slideHeader(s, {
      title: 'Qué se construyó',
      subtitle: 'Sistema integral desplegado en producción (Railway).',
    });
    s.addText(
      [
        { text: 'Recepción → Proceso → Unidad PT → Existencias → Despacho', options: { bullet: true } },
        { text: 'Empaque: materiales, kardex, recetas y consumos', options: { bullet: true } },
        { text: 'Comercial: pedidos, avance y documentos PDF', options: { bullet: true } },
        { text: 'Reportes: operación, decisión, cierre y balance de masas', options: { bullet: true } },
      ],
      {
        x: 0.55,
        y: 1.8,
        w: 4.85,
        h: 3.1,
        fontSize: 13,
        color: COLORS.slate900,
        fontFace: 'Segoe UI',
      },
    );
    addFramedImage(s, {
      path: shot('07_navegacion_general/07_header_logo_pinebloom.png'),
      ...LAYOUT.rightPanel,
      y: 1.85,
      h: 1.15,
    });
    addFramedImage(s, {
      path: shot('01_dashboard/01_dashboard_kpis_acumulado.png'),
      x: 5.4,
      y: 3.15,
      w: 4.2,
      h: 2.05,
    });
  }

  // —— Slide 3 Menú navegación ——
  {
    const s = newSlide(pres);
    slideHeader(s, {
      title: 'Menú de navegación',
      subtitle: 'Módulos visibles en producción (rol administrador).',
    });
    s.addText(
      'Principal · Planta y datos · Packaging · Operación · Comercial y logística · Análisis · Ayuda · Administración',
      {
        x: 0.55,
        y: 1.75,
        w: 4.7,
        h: 0.9,
        fontSize: 12,
        color: COLORS.slate600,
        fontFace: 'Segoe UI',
      },
    );
    addFramedImage(s, {
      path: shot('07_navegacion_general/07_sidebar_completo_superior.png'),
      x: 5.4,
      y: 1.45,
      w: 4.2,
      h: 2.05,
    });
    addFramedImage(s, {
      path: shot('07_navegacion_general/07_sidebar_completo_inferior.png'),
      x: 5.4,
      y: 3.65,
      w: 4.2,
      h: 1.75,
    });
  }

  // —— Slide 4 Flujo operativo ——
  {
    const s = newSlide(pres);
    slideHeader(s, {
      title: 'Flujo operativo',
      subtitle: 'Capturas reales de la temporada en producción.',
    });
    addTraceabilityRow(s, 'es');
  }

  // —— Slide 5 Reportes detalle ——
  {
    const s = newSlide(pres);
    slideHeader(s, {
      title: 'Reportes — cuatro pestañas',
      subtitle: 'Operación y Decisión (fecha operativa) · Cierre y Documentos (período).',
    });
    const tabs = [
      { rel: '04_analisis_reportes/04_reportes_operacion_eod.png', label: 'Operación' },
      { rel: '04_analisis_reportes/04_reportes_decision_planificacion.png', label: 'Decisión' },
      { rel: '04_analisis_reportes/04_reportes_cierre_productor_toggle.png', label: 'Cierre' },
      { rel: '04_analisis_reportes/04_reportes_documentos_balance_masas.png', label: 'Documentos' },
    ];
    const xs = [0.4, 2.55, 4.7, 6.85];
    tabs.forEach((tab, i) => {
      s.addText(tab.label, {
        x: xs[i],
        y: 1.35,
        w: 1.95,
        h: 0.3,
        fontSize: 11,
        bold: true,
        color: COLORS.navy,
        align: 'center',
        fontFace: 'Segoe UI',
      });
      addFramedImage(s, {
        path: shot(tab.rel),
        x: xs[i],
        y: 1.75,
        w: 2.05,
        h: 3.55,
      });
    });
  }

  // —— Slide 6 Documentos ——
  {
    const s = newSlide(pres);
    slideHeader(s, {
      title: 'Documentos generados',
      subtitle: 'PDFs alineados con datos operativos — franja corporativa #1A3A5C.',
    });
    addPdfFramedImage(s, {
      path: pdfPath('02_operacion', '02_recepcion_pdf_fruit_record.png'),
      x: 0.45,
      y: 1.75,
      w: 3.05,
      h: 3.45,
    });
    addPdfFramedImage(s, {
      path: pdfPath('03_comercial_logistica', '03_despacho_pdf_bol.png'),
      x: 3.55,
      y: 1.75,
      w: 3.05,
      h: 3.45,
    });
    addPdfFramedImage(s, {
      path: pdfPath('04_analisis_reportes', '04_liquidacion_productor_pdf.png'),
      x: 6.65,
      y: 1.75,
      w: 3.05,
      h: 3.45,
    });
  }

  // —— Slide 7 Dashboard detalle ——
  {
    const s = newSlide(pres);
    slideHeader(s, {
      title: 'Inicio operativo',
      subtitle: 'KPIs acumulados, gráfico recibido vs empacado y avance de pedidos.',
    });
    s.addText(
      [
        { text: 'Filtros: Hoy · Semana · Acumulado', options: { bullet: true } },
        { text: 'Entrada · Proceso · Salida + bloque comercial', options: { bullet: true } },
        { text: 'Gauges de pedidos pendientes', options: { bullet: true } },
      ],
      {
        x: 0.55,
        y: 1.85,
        w: 4.5,
        h: 2.2,
        fontSize: 13,
        color: COLORS.slate900,
        fontFace: 'Segoe UI',
      },
    );
    addFramedImage(s, {
      path: shot('01_dashboard/01_dashboard_kpis_acumulado.png'),
      ...LAYOUT.rightHalfTop,
    });
    addFramedImage(s, {
      path: shot('01_dashboard/01_dashboard_avance_pedidos.png'),
      ...LAYOUT.rightHalfBottom,
    });
  }

  // —— Slide 8 Costos ——
  {
    const s = newSlide(pres);
    slideHeader(s, {
      title: 'Costos vs herramientas fragmentadas',
      subtitle: 'Comparativa para decisión interna.',
    });
    const rows = [
      [
        { text: 'Capacidad', options: { bold: true, fill: { color: COLORS.navy }, color: COLORS.white } },
        { text: 'Excel / ERP parcial', options: { bold: true, fill: { color: COLORS.slate200 } } },
        { text: 'Pinebloom', options: { bold: true, fill: { color: COLORS.greenLight } } },
      ],
      ['Liquidación productor (pack fee)', 'Manual', 'Cierre + PDF'],
      ['Balance de masas', 'Poco común', 'Pestaña Documentos'],
      ['Trazabilidad TAR → despacho', 'Parcial', 'Nativa'],
      ['UI bilingüe ES/EN', 'Raro', 'Incluida'],
    ];
    s.addTable(rows, {
      x: 0.45,
      y: 1.65,
      w: 9.1,
      h: 3.5,
      fontSize: 11,
      border: { pt: 0.5, color: COLORS.slate200 },
    });
  }

  // —— Slide 9 Stack ——
  {
    const s = newSlide(pres);
    slideHeader(s, { title: 'Stack tecnológico', subtitle: 'Arquitectura actual del repositorio.' });
    s.addText(
      [
        { text: 'React 18 + TypeScript + i18n (ES/EN)', options: { bullet: true } },
        { text: 'NestJS 10 + PostgreSQL + migraciones TypeORM', options: { bullet: true } },
        { text: 'PDFKit, ExcelJS, JWT + roles', options: { bullet: true } },
        { text: 'Despliegue: Railway (producción)', options: { bullet: true } },
      ],
      {
        x: 0.55,
        y: 1.8,
        w: 4.85,
        h: 3.0,
        fontSize: 13,
        color: COLORS.slate900,
        fontFace: 'Segoe UI',
      },
    );
    addFramedImage(s, {
      path: shot('07_navegacion_general/07_header_logo_pinebloom.png'),
      x: 5.35,
      y: 1.35,
      w: 4.35,
      h: 1.1,
    });
    addFramedImage(s, {
      path: shot('07_navegacion_general/07_idioma_es_dashboard.png'),
      ...LAYOUT.stackDashboard,
    });
  }

  // —— Slide 10 Correcciones ——
  {
    const s = newSlide(pres);
    slideHeader(s, {
      title: 'Correcciones recientes',
      subtitle: 'Calidad de datos y UX (2025–2026).',
    });
    s.addText(
      [
        { text: 'Recargo formato premium: lb reales 12×9.8oz en Excel pack fee', options: { bullet: true } },
        { text: 'Pestaña Documentos: solo balance de masas', options: { bullet: true } },
        { text: 'Rol viewer: lectura + reportes sin edición', options: { bullet: true } },
        { text: 'Cierre: tarifas colapsadas por defecto; tabs sin selección inicial', options: { bullet: true } },
      ],
      {
        x: 0.55,
        y: 1.85,
        w: 4.5,
        h: 3.2,
        fontSize: 13,
        color: COLORS.slate900,
        fontFace: 'Segoe UI',
      },
    );
    addFramedImage(s, {
      path: shot('04_analisis_reportes/04_reportes_cierre_liquidacion_global.png'),
      ...LAYOUT.rightTextPanel,
    });
  }

  // —— Slide 11 Pendiente ——
  {
    const s = newSlide(pres);
    slideHeader(s, { title: 'Pendiente / próximos pasos', subtitle: 'Backlog acordado.' });
    s.addText(
      [
        { text: 'Conectores contables / ERP', options: { bullet: true } },
        { text: 'App móvil para escaneo en cámara', options: { bullet: true } },
        { text: 'Plantillas de reporte por cliente', options: { bullet: true } },
        { text: 'Automatización de alertas por email', options: { bullet: true } },
      ],
      {
        x: 0.55,
        y: 1.85,
        w: 4.5,
        h: 3.2,
        fontSize: 14,
        color: COLORS.slate900,
        fontFace: 'Segoe UI',
      },
    );
    addFramedImage(s, {
      path: shot('02_operacion/02_existencias_inventario_camara.png'),
      ...LAYOUT.rightTextPanel,
    });
  }

  // —— Slide 12 Cierre interno ——
  {
    const s = newSlide(pres);
    darkSlideBg(s);
    addImageContain(s, {
      path: shot('01_dashboard/01_dashboard_produccion_clientes.png'),
      x: 0.35,
      y: 0.85,
      w: 4.6,
      h: 4.2,
      transparency: 80,
    });
    s.addText('Cierre interno', {
      x: 5.0,
      y: 1.5,
      w: 4.5,
      h: 0.65,
      fontSize: 30,
      bold: true,
      color: COLORS.white,
      fontFace: 'Segoe UI',
    });
    s.addText(
      'Capturas: screenshots-pinebloom/\nPresentación v2 generada con npm run presentations:v2',
      {
        x: 5.0,
        y: 2.35,
        w: 4.5,
        h: 1.5,
        fontSize: 13,
        color: 'CBD5E1',
        fontFace: 'Segoe UI',
      },
    );
  }
}

/** Slide 8 EN: etiqueta Zebra si la captura es válida; si no, lista PT. */
function slide8EnLeftImage() {
  const zebra = join(SHOTS_ROOT, '02_operacion', '02_tarja_etiqueta_zebra_preview.png');
  const lista = join(SHOTS_ROOT, '02_operacion', '02_unidades_pt_lista.png');
  /** Embed fallido ≈ 9.5 KB; etiqueta PDF.js válida suele ser ≥ 12 KB */
  const MIN_ZEBRA_BYTES = 12_000;
  if (existsSync(zebra) && statSync(zebra).size >= MIN_ZEBRA_BYTES) return zebra;
  if (existsSync(zebra)) {
    console.warn(`Zebra preview ${statSync(zebra).size} B < ${MIN_ZEBRA_BYTES} — usando lista PT`);
  }
  if (!existsSync(lista)) throw new Error(`Captura no encontrada: ${lista}`);
  return lista;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log('SHOTS_ROOT =', SHOTS_ROOT);

  const enOnly = process.argv.includes('--en');
  const esOnly = process.argv.includes('--es');

  const enPath = `${OUT_DIR}/Pinebloom_Packing_System_EN_v2.pptx`;
  const esPath = `${OUT_DIR}/Pinebloom_Packing_System_ES_v2.pptx`;

  if (!esOnly) {
    const presEn = new pptxgen();
    presEn.layout = 'LAYOUT_16x9';
    presEn.author = 'Pinebloom Packing';
    presEn.title = 'Pinebloom Packing System';
    buildEN(presEn);
    await presEn.writeFile({ fileName: enPath });
    console.log(`✓ ${enPath}`);
  }

  if (!enOnly) {
    const presEs = new pptxgen();
    presEs.layout = 'LAYOUT_16x9';
    presEs.author = 'Pinebloom Packing';
    presEs.title = 'Pinebloom Packing System (ES)';
    buildES(presEs);
    await presEs.writeFile({ fileName: esPath });
    console.log(`✓ ${esPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

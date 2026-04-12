/* eslint-disable @typescript-eslint/no-require */
/**
 * Siembra mínima vía API HTTP para validación E2E después de `npm run dev:clear-data`.
 *
 * Requisitos: API levantada (PORT o 3000), usuarios en AUTH_USERS_JSON (.env).
 *
 *   npm run seed:validation
 *   API_BASE=http://127.0.0.1:3000 npm run seed:validation
 */
require('dotenv').config();

const API_BASE = (process.env.API_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');

const sfx = `V${Date.now().toString(36)}`.toUpperCase();
/** Válido para el regex NxMoz; evita colisión típica con 12x18oz de demos. */
function pickFormatCode() {
  let n = 14 + (Date.now() % 8);
  if (n === 12) n = 13;
  return `${n}x18oz`;
}
const formatCode = pickFormatCode();

async function req(method, path, { token, body } = {}) {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.message || json?.raw || text || res.statusText;
    throw new Error(`${method} ${path} → ${res.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  return json;
}

async function login(username, password) {
  const r = await req('POST', '/api/auth/login', { body: { username, password } });
  return r.access_token;
}

async function ensureCatalog(supervisorToken) {
  const postIfMissing = async (getPath, postPath, listPred, body) => {
    const cur = await req('GET', getPath, { token: supervisorToken });
    const arr = Array.isArray(cur) ? cur : [];
    if (arr.some(listPred)) return;
    await req('POST', postPath, { token: supervisorToken, body });
  };
  await postIfMissing(
    '/api/masters/document-states',
    '/api/masters/document-states',
    (x) => x.codigo === 'borrador',
    { codigo: 'borrador', nombre: 'Borrador' },
  );
  await postIfMissing(
    '/api/masters/reception-types',
    '/api/masters/reception-types',
    (x) => x.codigo === 'hand_picking',
    { codigo: 'hand_picking', nombre: 'Mano' },
  );
  await postIfMissing(
    '/api/masters/mercados',
    '/api/masters/mercados',
    (x) => x.codigo === 'USA',
    { codigo: 'USA', nombre: 'USA' },
  );
}

async function seedMaterialsAndRecipe(operatorToken, presentationFormatId) {
  const cats = await req('GET', '/api/masters/material-categories', { token: operatorToken });
  const idOf = (codigo) => cats.find((c) => c.codigo === codigo)?.id;
  if (!idOf('clamshell')) {
    console.warn('Faltan categorías de material; creá clamshell/tape desde Maestros o ampliá este script.');
    return null;
  }
  const clamshell = await req('POST', '/api/packaging/materials', {
    token: operatorToken,
    body: {
      nombre_material: `Clamshell VAL ${sfx}`,
      material_category_id: idOf('clamshell'),
      unidad_medida: 'unit',
      costo_unitario: 0.4,
      cantidad_disponible: 10000,
    },
  });
  const recipe = await req('POST', '/api/packaging/recipes', {
    token: operatorToken,
    body: { presentation_format_id: presentationFormatId, descripcion: `Receta validación ${sfx}` },
  });
  await req('POST', `/api/packaging/recipes/${recipe.id}/items`, {
    token: operatorToken,
    body: { material_id: clamshell.id, qty_per_unit: 12, base_unidad: 'box' },
  });
  return { recipeId: recipe.id, materialId: clamshell.id };
}

async function main() {
  const supUser = process.env.VALIDATION_SUPERVISOR_USER || 'supervisor';
  const supPass = process.env.VALIDATION_SUPERVISOR_PASS || 'sup123';
  const opUser = process.env.VALIDATION_OPERATOR_USER || 'operator';
  const opPass = process.env.VALIDATION_OPERATOR_PASS || 'op123';

  const supervisorToken = await login(supUser, supPass);
  const operatorToken = await login(opUser, opPass);

  await ensureCatalog(supervisorToken);

  const species = await req('POST', '/api/masters/species', {
    token: supervisorToken,
    body: { codigo: `BB${sfx}`, nombre: `Blueberries validación ${sfx}` },
  });
  const producer1 = await req('POST', '/api/masters/producers', {
    token: supervisorToken,
    body: { codigo: `P1${sfx}`, nombre: `Productor Alfa ${sfx}` },
  });
  const producer2 = await req('POST', '/api/masters/producers', {
    token: supervisorToken,
    body: { codigo: `P2${sfx}`, nombre: `Productor Beta ${sfx}` },
  });
  const variety1 = await req('POST', '/api/masters/varieties', {
    token: supervisorToken,
    body: { species_id: species.id, codigo: `DUK${sfx}`, nombre: `Duke ${sfx}` },
  });
  const variety2 = await req('POST', '/api/masters/varieties', {
    token: supervisorToken,
    body: { species_id: species.id, codigo: `LEG${sfx}`, nombre: `Legacy ${sfx}` },
  });
  const format = await req('POST', '/api/masters/presentation-formats', {
    token: supervisorToken,
    body: {
      format_code: formatCode,
      net_weight_lb_per_box: 13.5,
      max_boxes_per_pallet: 100,
    },
  });
  const qg = await req('POST', '/api/masters/quality-grades', {
    token: supervisorToken,
    body: { codigo: `Q${sfx}`, nombre: `Export ${sfx}`, purpose: 'exportacion' },
  });
  const ret = await req('POST', '/api/masters/returnable-containers', {
    token: supervisorToken,
    body: { tipo: 'Bin', capacidad: `VAL-${sfx}` },
  });
  const client = await req('POST', '/api/masters/clients', {
    token: supervisorToken,
    body: { codigo: `CLI${sfx}`, nombre: `Cliente comercial ${sfx}` },
  });
  const brand = await req('POST', '/api/masters/brands', {
    token: supervisorToken,
    body: { codigo: `BR${sfx}`, nombre: `Marca ${sfx}`, client_id: client.id },
  });

  await req('POST', '/api/reporting/packing-costs', {
    token: supervisorToken,
    body: { species_id: species.id, price_per_lb: 0.18, active: true },
  });

  let recipeInfo;
  try {
    recipeInfo = await seedMaterialsAndRecipe(operatorToken, format.id);
  } catch (e) {
    console.warn('Receta/materiales omitidos (¿ya existía receta para el formato?):', e.message);
    recipeInfo = null;
  }

  // ——— Escenario A ———
  const recA = await req('POST', '/api/receptions', {
    token: operatorToken,
    body: {
      received_at: '2026-05-01T08:00:00.000Z',
      document_number: `REC-A-${sfx}`,
      producer_id: producer1.id,
      variety_id: variety1.id,
      lines: [
        {
          species_id: species.id,
          variety_id: variety1.id,
          quality_grade_id: qg.id,
          returnable_container_id: ret.id,
          quantity: 1,
          net_lb: 4000,
        },
      ],
    },
  });
  const lineA = recA.lines[0].id;

  const procA = await req('POST', '/api/processes', {
    token: operatorToken,
    body: {
      producer_id: producer1.id,
      allocations: [{ reception_line_id: lineA, lb_allocated: 1350 }],
      fecha_proceso: '2026-05-01T10:00:00.000Z',
      resultado: 'IQF',
    },
  });

  const tagA = await req('POST', '/api/pt-tags', {
    token: operatorToken,
    body: {
      fecha: '2026-05-01T10:30:00.000Z',
      resultado: 'IQF',
      format_code: formatCode,
      cajas_por_pallet: 100,
    },
  });
  await req('POST', `/api/pt-tags/${tagA.id}/items`, {
    token: operatorToken,
    body: { process_id: procA.id },
  });

  const soA = await req('POST', '/api/sales-orders', {
    token: supervisorToken,
    body: {
      cliente_id: client.id,
      lines: [
        {
          presentation_format_id: format.id,
          requested_boxes: 5000,
          unit_price: null,
          brand_id: null,
          variety_id: null,
        },
      ],
    },
  });

  const fpA = await req('POST', '/api/final-pallets', {
    token: operatorToken,
    body: {
      species_id: species.id,
      status: 'definitivo',
      clamshell_label: `Clamshell A ${sfx}`,
      brand_id: brand.id,
      dispatch_unit: 'CHEP',
      packing_type: 'Exportadora',
      market: 'USA',
      client_id: client.id,
      fruit_quality_mode: 'proceso',
      presentation_format_id: format.id,
      lines: [
        {
          fruit_process_id: procA.id,
          fecha: '2026-05-01T12:00:00.000Z',
          variedad_id: variety1.id,
          amount: 10,
          pounds: 55.5,
          net_lb: 55.5,
        },
      ],
    },
  });

  const plA = await req('POST', '/api/pt-packing-lists', {
    token: operatorToken,
    body: { final_pallet_ids: [fpA.id] },
  });
  await req('POST', `/api/pt-packing-lists/${plA.id}/confirm`, { token: operatorToken });

  const dispA = await req('POST', '/api/dispatches', {
    token: operatorToken,
    body: {
      pt_packing_list_ids: [plA.id],
      orden_id: soA.id,
      cliente_id: client.id,
      fecha_despacho: '2026-05-01T16:00:00.000Z',
      numero_bol: `BOL-A-${sfx}`,
      temperatura_f: 34,
      final_pallet_unit_prices: { [String(format.id)]: 22.5 },
    },
  });
  await req('POST', `/api/dispatches/${dispA.id}/confirm`, { token: operatorToken });
  await req('POST', `/api/dispatches/${dispA.id}/packing-list/generate`, { token: operatorToken });
  const invA = await req('POST', `/api/dispatches/${dispA.id}/invoice/generate`, { token: operatorToken });

  if (recipeInfo) {
    try {
      await req('POST', '/api/packaging/consumptions', {
        token: operatorToken,
        body: {
          tarja_id: tagA.id,
          recipe_id: recipeInfo.recipeId,
          pallet_count: 1,
          boxes_count: 100,
          tape_linear_meters: 10,
          corner_boards_qty: 8,
          labels_qty: 100,
        },
      });
    } catch (e) {
      console.warn('Consumo de empaque (escenario A) omitido:', e.message);
    }
  }

  // ——— Escenario B: dos productores, dos pallets, repallet ———
  const recB1 = await req('POST', '/api/receptions', {
    token: operatorToken,
    body: {
      received_at: '2026-05-02T08:00:00.000Z',
      document_number: `REC-B1-${sfx}`,
      producer_id: producer1.id,
      variety_id: variety1.id,
      lines: [
        {
          species_id: species.id,
          variety_id: variety1.id,
          quality_grade_id: qg.id,
          returnable_container_id: ret.id,
          quantity: 1,
          net_lb: 5000,
        },
      ],
    },
  });
  const recB2 = await req('POST', '/api/receptions', {
    token: operatorToken,
    body: {
      received_at: '2026-05-02T08:30:00.000Z',
      document_number: `REC-B2-${sfx}`,
      producer_id: producer2.id,
      variety_id: variety2.id,
      lines: [
        {
          species_id: species.id,
          variety_id: variety2.id,
          quality_grade_id: qg.id,
          returnable_container_id: ret.id,
          quantity: 1,
          net_lb: 5000,
        },
      ],
    },
  });

  const procB1 = await req('POST', '/api/processes', {
    token: operatorToken,
    body: {
      producer_id: producer1.id,
      allocations: [{ reception_line_id: recB1.lines[0].id, lb_allocated: 2000 }],
      fecha_proceso: '2026-05-02T10:00:00.000Z',
      resultado: 'IQF',
    },
  });
  const procB2 = await req('POST', '/api/processes', {
    token: operatorToken,
    body: {
      producer_id: producer2.id,
      allocations: [{ reception_line_id: recB2.lines[0].id, lb_allocated: 2000 }],
      fecha_proceso: '2026-05-02T10:15:00.000Z',
      resultado: 'IQF',
    },
  });

  const linePayload = (pid, vid) => ({
    fruit_process_id: pid,
    fecha: '2026-05-02T12:00:00.000Z',
    variedad_id: vid,
    amount: 10,
    pounds: 135,
    net_lb: 135,
  });

  const fpB1 = await req('POST', '/api/final-pallets', {
    token: operatorToken,
    body: {
      species_id: species.id,
      status: 'definitivo',
      clamshell_label: `Clamshell B1 ${sfx}`,
      brand_id: brand.id,
      dispatch_unit: 'CHEP',
      packing_type: 'Exportadora',
      market: 'USA',
      client_id: client.id,
      fruit_quality_mode: 'proceso',
      presentation_format_id: format.id,
      lines: [linePayload(procB1.id, variety1.id)],
    },
  });
  const fpB2 = await req('POST', '/api/final-pallets', {
    token: operatorToken,
    body: {
      species_id: species.id,
      status: 'definitivo',
      clamshell_label: `Clamshell B2 ${sfx}`,
      brand_id: brand.id,
      dispatch_unit: 'CHEP',
      packing_type: 'Exportadora',
      market: 'USA',
      client_id: client.id,
      fruit_quality_mode: 'proceso',
      presentation_format_id: format.id,
      lines: [linePayload(procB2.id, variety2.id)],
    },
  });

  const repallet = await req('POST', '/api/final-pallets/repallet', {
    token: operatorToken,
    body: {
      sources: [
        { final_pallet_id: fpB1.id, boxes: 10 },
        { final_pallet_id: fpB2.id, boxes: 10 },
      ],
      notes: `Repalet validación ${sfx}`,
    },
  });

  const soB = await req('POST', '/api/sales-orders', {
    token: supervisorToken,
    body: {
      cliente_id: client.id,
      lines: [
        {
          presentation_format_id: format.id,
          requested_boxes: 5000,
          unit_price: null,
          brand_id: null,
          variety_id: null,
        },
      ],
    },
  });

  const plB = await req('POST', '/api/pt-packing-lists', {
    token: operatorToken,
    body: { final_pallet_ids: [repallet.id] },
  });
  await req('POST', `/api/pt-packing-lists/${plB.id}/confirm`, { token: operatorToken });

  const dispB = await req('POST', '/api/dispatches', {
    token: operatorToken,
    body: {
      pt_packing_list_ids: [plB.id],
      orden_id: soB.id,
      cliente_id: client.id,
      fecha_despacho: '2026-05-02T18:00:00.000Z',
      numero_bol: `BOL-B-${sfx}`,
      temperatura_f: 33,
      final_pallet_unit_prices: { [String(format.id)]: 23.0 },
    },
  });
  await req('POST', `/api/dispatches/${dispB.id}/confirm`, { token: operatorToken });
  await req('POST', `/api/dispatches/${dispB.id}/packing-list/generate`, { token: operatorToken });
  const invB = await req('POST', `/api/dispatches/${dispB.id}/invoice/generate`, { token: operatorToken });

  const summary = {
    sfx,
    masters: {
      species_id: species.id,
      species_codigo: species.codigo,
      producer_1_id: producer1.id,
      producer_2_id: producer2.id,
      variety_1_id: variety1.id,
      variety_2_id: variety2.id,
      format_code: formatCode,
      presentation_format_id: format.id,
      client_id: client.id,
      client_codigo: client.codigo,
      brand_id: brand.id,
    },
    escenarioA: {
      recepcion_documento: `REC-A-${sfx}`,
      recepcion_id: recA.id,
      proceso_id: procA.id,
      tarja_id: tagA.id,
      pallet_final_id: fpA.id,
      pallet_corner_code: fpA.corner_board_code,
      pt_packing_list_id: plA.id,
      dispatch_id: dispA.id,
      bol: `BOL-A-${sfx}`,
      invoice_number: invA.invoice_number,
      sales_order_id: soA.id,
    },
    escenarioB: {
      recepciones: [`REC-B1-${sfx}`, `REC-B2-${sfx}`],
      recepcion_ids: [recB1.id, recB2.id],
      proceso_ids: [procB1.id, procB2.id],
      pallets_origen_ids: [fpB1.id, fpB2.id],
      repallet_resultado_id: repallet.id,
      repallet_status: repallet.status,
      pt_packing_list_id: plB.id,
      dispatch_id: dispB.id,
      bol: `BOL-B-${sfx}`,
      invoice_number: invB.invoice_number,
      sales_order_id: soB.id,
    },
    reportes: {
      fecha_desde_sugerida: '2026-05-01',
      fecha_hasta_sugerida: '2026-05-31',
      productor_ids_en_liquidacion: [producer1.id, producer2.id],
      cliente_id_para_margen: client.id,
    },
  };

  console.log('\n=== VALIDACIÓN: datos insertados ===\n');
  console.log(JSON.stringify(summary, null, 2));
  console.log('\nComprobaciones rápidas:');
  console.log(`  GET ${API_BASE}/api/reporting/generate?fecha_desde=2026-05-01&fecha_hasta=2026-05-31&cliente_id=${client.id}`);
  console.log(`  Liquidación PDF: .../api/reporting/producer-settlement/pdf?fecha_desde=2026-05-01&fecha_hasta=2026-05-31\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

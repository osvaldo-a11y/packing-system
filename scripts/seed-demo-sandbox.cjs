/* eslint-disable @typescript-eslint/no-require */
/**
 * Siembra DEMO_SANDBOX vía API HTTP: maestros Pinebloom Farms + flujo operativo coherente.
 *
 *   API_BASE=http://127.0.0.1:3000 npm run seed:demo
 *
 * Requiere GET /api/auth/health → demo_sandbox=true (o DEMO_SEED_ALLOW_NON_SANDBOX, peligroso).
 * Credenciales admin: DEMO_SEED_USER / DEMO_SEED_PASS (default admin / admin123).
 *
 * Idempotente: códigos estables; tras POST /api/demo/reset se puede volver a ejecutar.
 */
require('dotenv').config();

const { assertNotProductionApi, assertDemoSandboxHealth } = require('./demo-safety.cjs');

const API_BASE = (process.env.API_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');

const FORMAT_CODE = '12x18oz';
const NET_LB_BOX = 13.5;
const CAJAS_POR_PALLET = 96;

function pad(n) {
  return String(n).padStart(2, '0');
}
/** Fechas ancladas al 'hoy' del servidor para que el filtro Hoy de la UI no quede vacío. */
function localYmd(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isoLocal(offsetDays, hh, mm) {
  return `${localYmd(offsetDays)}T${pad(hh)}:${pad(mm)}:00.000Z`;
}

async function req(method, path, { token, body } = {}) {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
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

function asList(cur) {
  if (Array.isArray(cur)) return cur;
  if (Array.isArray(cur?.items)) return cur.items;
  if (Array.isArray(cur?.data)) return cur.data;
  return [];
}

async function login(username, password) {
  const r = await req('POST', '/api/auth/login', { body: { username, password } });
  return r.access_token;
}

function matchCodigo(row, codigo, nombre) {
  const c = String(row.codigo ?? row.format_code ?? '').toLowerCase();
  const n = String(row.nombre ?? row.nombre_material ?? '').toLowerCase();
  return (
    (codigo && c === String(codigo).toLowerCase()) ||
    (nombre && n === String(nombre).toLowerCase())
  );
}

async function ensureByCodigo(token, getPath, postPath, codigo, body) {
  const cur = asList(await req('GET', getPath, { token }));
  const found = cur.find((x) => matchCodigo(x, codigo, body.nombre));
  if (found) return found;
  try {
    return await req('POST', postPath, { token, body });
  } catch (e) {
    const msg = String(e.message || e);
    if (/400|409|ya existe|already exists/i.test(msg)) {
      const again = asList(await req('GET', getPath, { token }));
      const hit = again.find((x) => matchCodigo(x, codigo, body.nombre));
      if (hit) return hit;
    }
    throw e;
  }
}

async function ensureFormat(token, speciesId) {
  const cur = asList(await req('GET', '/api/masters/presentation-formats', { token }));
  const found = cur.find((x) => String(x.format_code ?? '').toLowerCase() === FORMAT_CODE);
  if (found) return found;
  try {
    return await req('POST', '/api/masters/presentation-formats', {
      token,
      body: {
        format_code: FORMAT_CODE,
        species_id: speciesId,
        descripcion: '12 clamshell × 18 oz — Pinebloom demo',
        net_weight_lb_per_box: NET_LB_BOX,
        max_boxes_per_pallet: CAJAS_POR_PALLET,
        box_kind: 'mano',
      },
    });
  } catch (e) {
    const again = asList(await req('GET', '/api/masters/presentation-formats', { token }));
    const hit = again.find((x) => String(x.format_code ?? '').toLowerCase() === FORMAT_CODE);
    if (hit) return hit;
    throw e;
  }
}

async function deactivateIfMatch(token, getPath, putPath, pred) {
  const rows = asList(await req('GET', getPath, { token }));
  for (const row of rows) {
    if (!pred(row) || row.activo === false) continue;
    try {
      await req('PUT', `${putPath}/${row.id}`, { token, body: { activo: false } });
    } catch (e) {
      console.warn(`no se desactivó ${putPath}/${row.id}:`, e.message);
    }
  }
}

async function findMaterial(token, nombre) {
  const mats = asList(await req('GET', '/api/packaging/materials', { token }));
  return mats.find((m) => String(m.nombre_material ?? '').toLowerCase() === nombre.toLowerCase()) || null;
}

async function ensureMaterial(token, spec) {
  const existing = await findMaterial(token, spec.nombre_material);
  if (existing) return existing;
  return req('POST', '/api/packaging/materials', {
    token,
    body: {
      nombre_material: spec.nombre_material,
      material_category_id: spec.material_category_id,
      descripcion: spec.descripcion,
      unidad_medida: spec.unidad_medida,
      costo_unitario: spec.costo_unitario,
      cantidad_disponible: 0,
      presentation_format_ids: spec.presentation_format_ids,
      client_ids: spec.client_ids,
      clamshell_units_per_box: spec.clamshell_units_per_box,
    },
  });
}

async function applyKardexPlan(token, material, plan, targetStock) {
  const current = Number(material.cantidad_disponible) || 0;
  if (current === 0) {
    for (const mv of plan) {
      await req('POST', `/api/packaging/materials/${material.id}/movements`, {
        token,
        body: mv,
      });
    }
    return;
  }
  const delta = targetStock - current;
  if (Math.abs(delta) < 0.001) return;
  await req('POST', `/api/packaging/materials/${material.id}/movements`, {
    token,
    body: {
      quantity_delta: delta,
      ref_type: 'manual',
      nota: 'Ajuste demo para alinear stock al dataset inicial.',
    },
  });
}

async function palletForTag(token, tarjaId, tagCode) {
  const pallets = asList(await req('GET', '/api/final-pallets', { token }));
  const hit = pallets.find((p) => {
    const ids = p.tarja_ids || p.tarjaIds || [];
    if (Array.isArray(ids) && ids.some((id) => Number(id) === Number(tarjaId))) return true;
    if (Number(p.tarja_id) === Number(tarjaId)) return true;
    if (tagCode && String(p.tag_code || '') === String(tagCode)) return true;
    return false;
  });
  if (!hit) throw new Error(`No hay pallet final para tarja ${tarjaId}`);
  return hit;
}

async function main() {
  assertNotProductionApi(API_BASE);
  const health = await req('GET', '/api/auth/health');
  if (!health?.demo_sandbox && process.env.DEMO_SEED_ALLOW_NON_SANDBOX !== 'true') {
    assertDemoSandboxHealth(health);
  }
  if (health?.demo_sandbox !== true && process.env.DEMO_SEED_ALLOW_NON_SANDBOX === 'true') {
    console.warn('ADVERTENCIA: DEMO_SEED_ALLOW_NON_SANDBOX=true — el API no es sandbox.');
  } else {
    assertDemoSandboxHealth(health);
  }

  const creds = [
    [process.env.DEMO_SEED_USER, process.env.DEMO_SEED_PASS],
    ['admin', 'admin123'],
    [process.env.DEMO_USERNAME || 'admin.demo', process.env.DEMO_PASSWORD || 'demo123'],
    ['demo', 'demo123'],
  ].filter((p, i, arr) => p[0] && p[1] && arr.findIndex((q) => q[0] === p[0] && q[1] === p[1]) === i);
  let token;
  const errors = [];
  for (const [u, p] of creds) {
    try {
      token = await login(u, p);
      break;
    } catch (e) {
      errors.push(`${u}: ${e.message}`);
    }
  }
  if (!token) {
    throw new Error(`Login admin para seed falló. Intentos:\n${errors.join('\n')}`);
  }

  const stBorrador = await ensureByCodigo(token, '/api/masters/document-states', '/api/masters/document-states', 'borrador', {
    codigo: 'borrador',
    nombre: 'Borrador',
  });
  const stConfirmado = await ensureByCodigo(
    token,
    '/api/masters/document-states',
    '/api/masters/document-states',
    'confirmado',
    { codigo: 'confirmado', nombre: 'Confirmado' },
  );
  const recType = await ensureByCodigo(token, '/api/masters/reception-types', '/api/masters/reception-types', 'hand_picking', {
    codigo: 'hand_picking',
    nombre: 'Mano',
  });
  const mercado = await ensureByCodigo(token, '/api/masters/mercados', '/api/masters/mercados', 'USA', {
    codigo: 'USA',
    nombre: 'USA',
  });

  for (const [codigo, nombre] of [
    ['clamshell', 'Clamshell'],
    ['tape', 'Cinta'],
    ['etiqueta', 'Etiqueta'],
    ['pallet', 'Pallet'],
    ['corner_board', 'Corner board'],
  ]) {
    await ensureByCodigo(token, '/api/masters/material-categories', '/api/masters/material-categories', codigo, {
      codigo,
      nombre,
    });
  }

  const species = await ensureByCodigo(token, '/api/masters/species', '/api/masters/species', 'BB', {
    codigo: 'BB',
    nombre: 'Blueberries',
  });
  const producer1 = await ensureByCodigo(token, '/api/masters/producers', '/api/masters/producers', 'PB-PINOS', {
    codigo: 'PB-PINOS',
    nombre: 'Fundo Los Pinos',
  });
  const producer2 = await ensureByCodigo(token, '/api/masters/producers', '/api/masters/producers', 'PB-MOLINO', {
    codigo: 'PB-MOLINO',
    nombre: 'Fundo El Molino',
  });
  const varietyDuke = await ensureByCodigo(token, '/api/masters/varieties', '/api/masters/varieties', 'DUK', {
    species_id: species.id,
    codigo: 'DUK',
    nombre: 'Duke',
  });
  const varietyLegacy = await ensureByCodigo(token, '/api/masters/varieties', '/api/masters/varieties', 'LEG', {
    species_id: species.id,
    codigo: 'LEG',
    nombre: 'Legacy',
  });
  const format = await ensureFormat(token, species.id);
  const qg = await ensureByCodigo(token, '/api/masters/quality-grades', '/api/masters/quality-grades', 'EXP', {
    codigo: 'EXP',
    nombre: 'Export',
    purpose: 'exportacion',
  });
  const client = await ensureByCodigo(token, '/api/masters/clients', '/api/masters/clients', 'NSTAR', {
    codigo: 'NSTAR',
    nombre: 'Northstar Produce LLC',
    pais: 'USA',
    mercado_id: mercado.id,
  });
  const brand = await ensureByCodigo(token, '/api/masters/brands', '/api/masters/brands', 'PINEBLOOM', {
    codigo: 'PINEBLOOM',
    nombre: 'Pinebloom Farms',
    client_id: client.id,
  });
  if (brand.client_id !== client.id) {
    try {
      await req('PUT', `/api/masters/brands/${brand.id}`, {
        token,
        body: { client_id: client.id, nombre: 'Pinebloom Farms' },
      });
    } catch (e) {
      console.warn('marca PINEBLOOM:', e.message);
    }
  }
  const bins = asList(await req('GET', '/api/masters/returnable-containers', { token }));
  let bin = bins.find((x) => String(x.capacidad ?? '') === 'DEMO-BIN-18' || String(x.tipo ?? '') === 'Bin');
  if (!bin) {
    bin = await req('POST', '/api/masters/returnable-containers', {
      token,
      body: { tipo: 'Bin', capacidad: 'DEMO-BIN-18' },
    });
  }

  try {
    await req('POST', '/api/reporting/packing-costs', {
      token,
      body: { species_id: species.id, price_per_lb: 0.18, active: true },
    });
  } catch (e) {
    console.warn('packing-costs:', e.message);
  }

  await deactivateIfMatch(
    token,
    '/api/masters/producers',
    '/api/masters/producers',
    (p) => p.codigo === '_MIG' || String(p.codigo || '').startsWith('HIST-'),
  );
  await deactivateIfMatch(
    token,
    '/api/masters/clients',
    '/api/masters/clients',
    (c) => c.codigo === 'JAEMOR-FARMS',
  );
  await deactivateIfMatch(token, '/api/masters/species', '/api/masters/species', (s) => s.codigo === '_MIG');
  await deactivateIfMatch(token, '/api/masters/varieties', '/api/masters/varieties', (v) => v.codigo === '_MIG');
  await deactivateIfMatch(token, '/api/masters/brands', '/api/masters/brands', (b) =>
    ['ALPINE', 'FOREST', 'FRESHWAVE', 'TWINSRIVER'].includes(String(b.codigo || '').toUpperCase()),
  );

  const cats = asList(await req('GET', '/api/masters/material-categories', { token }));
  const catId = (...codigos) => {
    const hit = cats.find((c) => codigos.some((code) => String(c.codigo).toLowerCase() === String(code).toLowerCase()));
    return hit ? Number(hit.id) : undefined;
  };

  const clam = await ensureMaterial(token, {
    nombre_material: 'Clamshell 18 oz Pinebloom',
    material_category_id: catId('clamshell'),
    descripcion: 'Clamshell 18 oz marca Pinebloom',
    unidad_medida: 'unit',
    costo_unitario: 0.35,
    presentation_format_ids: [format.id],
    client_ids: [client.id],
    clamshell_units_per_box: 12,
  });
  const tape = await ensureMaterial(token, {
    nombre_material: 'Cinta stretch 20"',
    material_category_id: catId('tape'),
    descripcion: 'Cinta de paletizado',
    unidad_medida: 'm',
    costo_unitario: 0.08,
  });
  const label = await ensureMaterial(token, {
    nombre_material: 'Etiqueta Pinebloom 18 oz',
    material_category_id: catId('etiqueta', 'label'),
    descripcion: 'Etiqueta de clamshell',
    unidad_medida: 'unit',
    costo_unitario: 0.04,
    presentation_format_ids: [format.id],
    client_ids: [client.id],
  });
  const palletMat = await ensureMaterial(token, {
    nombre_material: 'Pallet CHEP',
    material_category_id: catId('pallet'),
    descripcion: 'Pallet retornable CHEP',
    unidad_medida: 'unit',
    costo_unitario: 12,
  });
  const corner = catId('corner_board')
    ? await ensureMaterial(token, {
        nombre_material: 'Esquinero cartón 48"',
        material_category_id: catId('corner_board'),
        descripcion: 'Corner board de tripaje',
        unidad_medida: 'unit',
        costo_unitario: 0.55,
      })
    : null;

  const d0 = isoLocal(-5, 14, 0);
  const d1 = isoLocal(-2, 14, 0);
  const d2 = isoLocal(0, 9, 0);

  await applyKardexPlan(
    token,
    clam,
    [
      { quantity_delta: 8000, ref_type: 'inventario_inicial', nota: 'Inventario inicial campaña demo.', occurred_at: d0 },
      { quantity_delta: 4000, ref_type: 'compra', nota: 'Compra PackSupply — OC DEMO-441.', occurred_at: d1 },
      { quantity_delta: -500, ref_type: 'salida', nota: 'Salida a línea de packing Duke.', occurred_at: d2 },
    ],
    11500,
  );
  await applyKardexPlan(
    token,
    tape,
    [
      { quantity_delta: 600, ref_type: 'inventario_inicial', nota: 'Inventario inicial cinta.', occurred_at: d0 },
      { quantity_delta: 200, ref_type: 'compra', nota: 'Reposición cinta stretch.', occurred_at: d1 },
    ],
    800,
  );
  await applyKardexPlan(
    token,
    label,
    [
      { quantity_delta: 15000, ref_type: 'inventario_inicial', nota: 'Inventario inicial etiquetas.', occurred_at: d0 },
    ],
    15000,
  );
  await applyKardexPlan(
    token,
    palletMat,
    [
      { quantity_delta: 40, ref_type: 'inventario_inicial', nota: 'Inventario inicial pallets CHEP.', occurred_at: d0 },
      { quantity_delta: -4, ref_type: 'salida', nota: 'Pallets a cámara PT.', occurred_at: d2 },
    ],
    36,
  );
  if (corner) {
    await applyKardexPlan(
      token,
      corner,
      [
        { quantity_delta: 200, ref_type: 'inventario_inicial', nota: 'Inventario inicial esquineros.', occurred_at: d0 },
      ],
      200,
    );
  }

  try {
    const recipes = asList(await req('GET', '/api/packaging/recipes', { token }));
    const has = recipes.some((r) => Number(r.presentation_format_id) === Number(format.id));
    if (!has) {
      const recipe = await req('POST', '/api/packaging/recipes', {
        token,
        body: { presentation_format_id: format.id, descripcion: 'Receta 12x18oz Pinebloom', brand_id: brand.id },
      });
      await req('POST', `/api/packaging/recipes/${recipe.id}/items`, {
        token,
        body: { material_id: clam.id, qty_per_unit: 12, base_unidad: 'box' },
      });
    }
  } catch (e) {
    console.warn('receta:', e.message);
  }

  const line = (varietyId, netLb) => ({
    species_id: species.id,
    variety_id: varietyId,
    quality_grade_id: qg.id,
    returnable_container_id: bin.id,
    quantity: 1,
    net_lb: netLb,
  });

  const recDuke = await req('POST', '/api/receptions', {
    token,
    body: {
      received_at: isoLocal(0, 8, 0),
      document_number: 'REC-PB-4101',
      reference_code: 'PB4101',
      producer_id: producer1.id,
      variety_id: varietyDuke.id,
      reception_type_id: recType.id,
      mercado_id: mercado.id,
      document_state_id: stBorrador.id,
      notes: 'Lote Duke Fundo Los Pinos — campaña demo Pinebloom.',
      lines: [line(varietyDuke.id, 8000)],
    },
  });
  const recLegacy = await req('POST', '/api/receptions', {
    token,
    body: {
      received_at: isoLocal(0, 8, 30),
      document_number: 'REC-PB-4102',
      reference_code: 'PB4102',
      producer_id: producer2.id,
      variety_id: varietyLegacy.id,
      reception_type_id: recType.id,
      mercado_id: mercado.id,
      document_state_id: stBorrador.id,
      notes: 'Lote Legacy Fundo El Molino.',
      lines: [line(varietyLegacy.id, 6000)],
    },
  });
  const recDraft = await req('POST', '/api/receptions', {
    token,
    body: {
      received_at: isoLocal(0, 9, 0),
      document_number: 'REC-PB-4103',
      reference_code: 'PB4103',
      producer_id: producer1.id,
      variety_id: varietyDuke.id,
      reception_type_id: recType.id,
      mercado_id: mercado.id,
      document_state_id: stBorrador.id,
      notes: 'Recepción en borrador para alta en vivo.',
      lines: [line(varietyDuke.id, 3500)],
    },
  });

  for (const rec of [recDuke, recLegacy]) {
    try {
      await req('PATCH', `/api/receptions/${rec.id}/state`, {
        token,
        body: { document_state_id: stConfirmado.id },
      });
    } catch (e) {
      console.warn(`confirmación recepción ${rec.document_number}:`, e.message);
    }
  }

  const procDuke = await req('POST', '/api/processes', {
    token,
    body: {
      producer_id: producer1.id,
      allocations: [{ reception_line_id: recDuke.lines[0].id, lb_allocated: 2700 }],
      fecha_proceso: isoLocal(0, 10, 0),
      resultado: 'cajas',
      nota: 'Proceso Duke — saldo de MP queda disponible en recepción 4101.',
    },
  });
  const procLegacy = await req('POST', '/api/processes', {
    token,
    body: {
      producer_id: producer2.id,
      allocations: [{ reception_line_id: recLegacy.lines[0].id, lb_allocated: 2000 }],
      fecha_proceso: isoLocal(0, 10, 30),
      resultado: 'cajas',
      nota: 'Proceso Legacy para repaletizaje y packing list.',
    },
  });

  const mkTag = async (processId, cajas, fecha, clientId, brandId) => {
    const tag = await req('POST', '/api/pt-tags', {
      token,
      body: {
        fecha,
        resultado: 'cajas',
        format_code: FORMAT_CODE,
        cajas_por_pallet: CAJAS_POR_PALLET,
        process_id: processId,
        cajas_generadas: cajas,
        client_id: clientId,
        brand_id: brandId,
      },
    });
    const pallet = await palletForTag(token, tag.id, tag.tag_code);
    return { tag, pallet };
  };

  // Duke 2700 lb / 13.5 = 200 cajas máx. 96+48+48=192; quedan ~8 para crear PT en vivo.
  const ptCamara = await mkTag(procDuke.id, 96, isoLocal(0, 11, 0), client.id, brand.id);
  const ptBorradorPl = await mkTag(procDuke.id, 48, isoLocal(0, 11, 20), client.id, brand.id);
  const ptShip = await mkTag(procDuke.id, 48, isoLocal(0, 11, 40), client.id, brand.id);
  const ptRep1 = await mkTag(procLegacy.id, 72, isoLocal(0, 12, 0), client.id, brand.id);
  const ptRep2 = await mkTag(procLegacy.id, 48, isoLocal(0, 12, 15), client.id, brand.id);

  const repallet = await req('POST', '/api/final-pallets/repallet', {
    token,
    body: {
      sources: [
        { final_pallet_id: ptRep1.pallet.id, boxes: 40 },
        { final_pallet_id: ptRep2.pallet.id, boxes: 24 },
      ],
      notes: 'Repaletizaje demo: consolidado Northstar 12x18oz.',
    },
  });

  const soOpen = await req('POST', '/api/sales-orders', {
    token,
    body: {
      cliente_id: client.id,
      order_number: 'SO-DEMO-1001',
      fecha_pedido: isoLocal(-3, 12, 0),
      fecha_despacho_cliente: isoLocal(2, 12, 0),
      lines: [
        {
          presentation_format_id: format.id,
          requested_boxes: 500,
          unit_price: 22.5,
          brand_id: brand.id,
          variety_id: varietyDuke.id,
        },
      ],
    },
  });
  const soShip = await req('POST', '/api/sales-orders', {
    token,
    body: {
      cliente_id: client.id,
      order_number: 'SO-DEMO-1002',
      fecha_pedido: isoLocal(-2, 12, 0),
      fecha_despacho_cliente: isoLocal(0, 16, 0),
      lines: [
        {
          presentation_format_id: format.id,
          requested_boxes: 200,
          unit_price: 23,
          brand_id: brand.id,
          variety_id: varietyLegacy.id,
        },
      ],
    },
  });

  const plDraft = await req('POST', '/api/pt-packing-lists', {
    token,
    body: {
      final_pallet_ids: [ptBorradorPl.pallet.id],
      list_date: localYmd(0),
      notes: 'Packing list en borrador — Duke 48 cajas.',
    },
  });
  const plReady = await req('POST', '/api/pt-packing-lists', {
    token,
    body: {
      final_pallet_ids: [repallet.id],
      list_date: localYmd(0),
      notes: 'Packing list confirmado listo para despacho en vivo.',
    },
  });
  try {
    await req('PATCH', `/api/pt-packing-lists/${plReady.id}/numero-bol`, {
      token,
      body: { numero_bol: 'BOL-DEMO-8802' },
    });
  } catch (e) {
    console.warn('BOL packing list listo:', e.message);
  }
  await req('POST', `/api/pt-packing-lists/${plReady.id}/confirm`, { token });

  const plShipped = await req('POST', '/api/pt-packing-lists', {
    token,
    body: {
      final_pallet_ids: [ptShip.pallet.id],
      list_date: localYmd(0),
      notes: 'Packing list del despacho de ejemplo.',
    },
  });
  try {
    await req('PATCH', `/api/pt-packing-lists/${plShipped.id}/numero-bol`, {
      token,
      body: { numero_bol: 'BOL-DEMO-8801' },
    });
  } catch (e) {
    console.warn('BOL packing list despachado:', e.message);
  }
  await req('POST', `/api/pt-packing-lists/${plShipped.id}/confirm`, { token });

  const disp = await req('POST', '/api/dispatches', {
    token,
    body: {
      pt_packing_list_ids: [plShipped.id],
      orden_id: soShip.id,
      cliente_id: client.id,
      client_id: client.id,
      fecha_despacho: isoLocal(0, 16, 0),
      numero_bol: 'BOL-DEMO-8801',
      temperatura_f: 34,
      final_pallet_unit_prices: { [String(format.id)]: 23 },
    },
  });
  await req('POST', `/api/dispatches/${disp.id}/confirm`, { token });
  try {
    await req('POST', `/api/dispatches/${disp.id}/packing-list/generate`, { token });
  } catch (e) {
    console.warn('generate packing-list despacho:', e.message);
  }

  const summary = {
    ok: true,
    api: API_BASE,
    demo_sandbox: health.demo_sandbox,
    login_cliente: {
      usuario: process.env.DEMO_USERNAME || 'admin.demo',
      password: process.env.DEMO_PASSWORD || 'demo123',
      nota: 'En sandbox el usuario demo es escribible (rol admin). También vale admin/admin123.',
    },
    relato: {
      planta: 'Pinebloom Farms',
      especie: 'Blueberries',
      variedad_hilo: 'Duke (Fundo Los Pinos) + Legacy (Fundo El Molino)',
      cliente: 'Northstar Produce LLC',
      marca: 'Pinebloom Farms',
      formato: FORMAT_CODE,
    },
    ids: {
      species_id: species.id,
      producer_los_pinos_id: producer1.id,
      producer_el_molino_id: producer2.id,
      variety_duke_id: varietyDuke.id,
      variety_legacy_id: varietyLegacy.id,
      format_id: format.id,
      client_id: client.id,
      brand_id: brand.id,
      reception_duke: recDuke.id,
      reception_legacy: recLegacy.id,
      reception_borrador: recDraft.id,
      process_duke: procDuke.id,
      process_legacy: procLegacy.id,
      pt_camara_tag: ptCamara.tag.id,
      pt_despacho_ejemplo_tag: ptShip.tag.id,
      pt_pl_borrador_tag: ptBorradorPl.tag.id,
      pallet_repallet: repallet.id,
      packing_list_borrador: plDraft.id,
      packing_list_listo_despacho: plReady.id,
      packing_list_ejemplo_despacho: plShipped.id,
      sales_order_abierto: soOpen.id,
      sales_order_despacho: soShip.id,
      dispatch_ejemplo: disp.id,
    },
    reset: 'API_BASE=... npm run demo:reset  (exige DEMO_SANDBOX=true y admin)',
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

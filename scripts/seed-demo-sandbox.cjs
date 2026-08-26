/* eslint-disable @typescript-eslint/no-require */
/**
 * Siembra un entorno DEMO_SANDBOX vía API HTTP (maestros + flujo mínimo operable).
 *
 * Uso (API del sandbox ya levantada):
 *   API_BASE=https://tu-demo.up.railway.app npm run seed:demo
 *
 * Credenciales admin del sandbox (defaults locales):
 *   DEMO_SEED_USER / DEMO_SEED_PASS  (default admin / admin123)
 */
require('dotenv').config();

const API_BASE = (process.env.API_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const sfx = `D${Date.now().toString(36)}`.toUpperCase();

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

async function login(username, password) {
  const r = await req('POST', '/api/auth/login', { body: { username, password } });
  return r.access_token;
}

async function ensureByCodigo(token, getPath, postPath, codigo, body) {
  const cur = await req('GET', getPath, { token });
  const arr = Array.isArray(cur) ? cur : Array.isArray(cur?.items) ? cur.items : [];
  const found = arr.find(
    (x) =>
      String(x.codigo ?? '').toLowerCase() === String(codigo).toLowerCase() ||
      String(x.nombre ?? '').toLowerCase() === String(body.nombre ?? '').toLowerCase(),
  );
  if (found) return found;
  try {
    return await req('POST', postPath, { token, body });
  } catch (e) {
    const msg = String(e.message || e);
    if (/400|ya existe|already exists/i.test(msg)) {
      const again = await req('GET', getPath, { token });
      const list = Array.isArray(again) ? again : Array.isArray(again?.items) ? again.items : [];
      const hit = list.find(
        (x) =>
          String(x.codigo ?? '').toLowerCase() === String(codigo).toLowerCase() ||
          String(x.nombre ?? '').toLowerCase() === String(body.nombre ?? '').toLowerCase(),
      );
      if (hit) return hit;
    }
    throw e;
  }
}

async function main() {
  const health = await req('GET', '/api/auth/health');
  if (!health?.demo_sandbox && process.env.DEMO_SEED_ALLOW_NON_SANDBOX !== 'true') {
    throw new Error(
      'El API no reporta demo_sandbox=true. Apuntá API_BASE al servicio sandbox o usá DEMO_SEED_ALLOW_NON_SANDBOX=true (peligroso).',
    );
  }

  const user = process.env.DEMO_SEED_USER || 'admin';
  const pass = process.env.DEMO_SEED_PASS || 'admin123';
  const token = await login(user, pass);

  await ensureByCodigo(token, '/api/masters/document-states', '/api/masters/document-states', 'borrador', {
    codigo: 'borrador',
    nombre: 'Borrador',
  });
  await ensureByCodigo(token, '/api/masters/document-states', '/api/masters/document-states', 'confirmado', {
    codigo: 'confirmado',
    nombre: 'Confirmado',
  });
  await ensureByCodigo(token, '/api/masters/reception-types', '/api/masters/reception-types', 'hand_picking', {
    codigo: 'hand_picking',
    nombre: 'Mano',
  });
  await ensureByCodigo(token, '/api/masters/mercados', '/api/masters/mercados', 'USA', {
    codigo: 'USA',
    nombre: 'USA',
  });

  for (const [codigo, nombre] of [
    ['clamshell', 'Clamshell'],
    ['tape', 'Cinta'],
    ['label', 'Etiqueta'],
    ['pallet', 'Pallet'],
  ]) {
    await ensureByCodigo(token, '/api/masters/material-categories', '/api/masters/material-categories', codigo, {
      codigo,
      nombre,
    });
  }

  const species = await req('POST', '/api/masters/species', {
    token,
    body: { codigo: `BB${sfx}`, nombre: `Blueberries demo ${sfx}` },
  });
  const producer = await req('POST', '/api/masters/producers', {
    token,
    body: { codigo: `PR${sfx}`, nombre: `Productor Demo ${sfx}` },
  });
  const variety = await req('POST', '/api/masters/varieties', {
    token,
    body: { species_id: species.id, codigo: `DUK${sfx}`, nombre: `Duke ${sfx}` },
  });
  const format = await req('POST', '/api/masters/presentation-formats', {
    token,
    body: {
      format_code: `${14 + (Date.now() % 5)}x18oz`,
      net_weight_lb_per_box: 13.5,
      max_boxes_per_pallet: 100,
    },
  });
  await req('POST', '/api/masters/quality-grades', {
    token,
    body: { codigo: `Q${sfx}`, nombre: `Export ${sfx}`, purpose: 'exportacion' },
  });
  const client = await req('POST', '/api/masters/clients', {
    token,
    body: { codigo: `CLI${sfx}`, nombre: `Cliente Demo ${sfx}` },
  });
  await req('POST', '/api/masters/brands', {
    token,
    body: { codigo: `BR${sfx}`, nombre: `Marca Demo ${sfx}`, client_id: client.id },
  });
  await req('POST', '/api/masters/returnable-containers', {
    token,
    body: { tipo: 'Bin', capacidad: `DEMO-${sfx}` },
  });

  try {
    await req('POST', '/api/reporting/packing-costs', {
      token,
      body: { species_id: species.id, price_per_lb: 0.2, active: true },
    });
  } catch (e) {
    console.warn('packing-costs:', e.message);
  }

  const cats = await req('GET', '/api/masters/material-categories', { token });
  const clamId = cats.find((c) => c.codigo === 'clamshell')?.id;
  if (clamId) {
    try {
      const mat = await req('POST', '/api/packaging/materials', {
        token,
        body: {
          nombre_material: `Clamshell demo ${sfx}`,
          material_category_id: clamId,
          unidad_medida: 'unit',
          costo_unitario: 0.35,
          cantidad_disponible: 5000,
        },
      });
      const recipe = await req('POST', '/api/packaging/recipes', {
        token,
        body: { presentation_format_id: format.id, descripcion: `Receta demo ${sfx}` },
      });
      await req('POST', `/api/packaging/recipes/${recipe.id}/items`, {
        token,
        body: { material_id: mat.id, qty_per_unit: 12, base_unidad: 'box' },
      });
    } catch (e) {
      console.warn('materiales/receta:', e.message);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        api: API_BASE,
        demo_sandbox: health.demo_sandbox,
        seeded: {
          species_id: species.id,
          producer_id: producer.id,
          variety_id: variety.id,
          format_id: format.id,
          client_id: client.id,
        },
        hint: 'Entrá con demo/demo123 (o las credenciales del sandbox) y cargá operaciones.',
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

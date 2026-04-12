import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const API_BASE = (process.env.API_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const USERNAME = process.env.EXPORT_USER || 'admin';
const PASSWORD = process.env.EXPORT_PASS || 'osaez789';

const SFX = process.env.TRACE_SFX || 'VMNSXXABI';
const OUT_DIR = process.env.EXPORT_OUT_DIR || `C:/Users/pckpi/Projects/packing-system/module-images/traceability-docs-${SFX}`;

const ids = {
  reception: [57, 58, 59],
  process: [48, 49, 50],
  ptTag: [16],
  dispatch: [29, 30],
  ptPackingList: [30, 31],
  clientId: 31,
  producerIds: [49, 50],
  formatId: 31,
};

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${method} ${path} -> ${res.status}: ${txt.slice(0, 220)}`);
  }
  return res;
}

async function login() {
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: { username: USERNAME, password: PASSWORD },
  });
  const json = await res.json();
  if (!json?.access_token) throw new Error('Login sin token');
  return json.access_token;
}

async function saveBinary(path, token, outName, options = {}) {
  const res = await api(path, { token, method: options.method || 'GET', body: options.body });
  const buf = Buffer.from(await res.arrayBuffer());
  const out = join(OUT_DIR, outName);
  await writeFile(out, buf);
  console.log(`saved ${out}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const token = await login();

  for (const id of ids.reception) {
    await saveBinary(`/api/documents/receptions/${id}/pdf`, token, `reception-${id}.pdf`);
  }
  for (const id of ids.process) {
    await saveBinary(`/api/documents/processes/${id}/pdf`, token, `process-${id}.pdf`);
  }
  for (const id of ids.ptTag) {
    await saveBinary(`/api/documents/pt-tags/${id}/pdf`, token, `unidad-pt-${id}.pdf`);
  }

  for (const id of ids.dispatch) {
    await saveBinary(`/api/documents/dispatches/${id}/packing-list/pdf`, token, `dispatch-${id}-packing-list.pdf`);
    await saveBinary(`/api/documents/dispatches/${id}/invoice/pdf`, token, `dispatch-${id}-invoice.pdf`);
  }

  for (const id of ids.ptPackingList) {
    await saveBinary(`/api/documents/pt-packing-lists/${id}/pdf`, token, `pt-packing-list-${id}.pdf`);
    await saveBinary(
      `/api/documents/pt-packing-lists/${id}/invoice/pdf`,
      token,
      `pt-packing-list-${id}-invoice.pdf`,
      {
        method: 'POST',
        body: { unit_prices_by_format_id: { [String(ids.formatId)]: 23 } },
      },
    );
  }

  // Reportes operativos (PDF perfiles + XLSX)
  const commonQ = `?fecha_desde=2026-05-01&fecha_hasta=2026-05-31&cliente_id=${ids.clientId}&page=1&limit=100`;
  await saveBinary(`/api/reporting/export${commonQ}&format=pdf&pdf_profile=internal`, token, `reporting-operativo-interno.pdf`);
  await saveBinary(`/api/reporting/export${commonQ}&format=pdf&pdf_profile=external`, token, `reporting-operativo-externo.pdf`);
  await saveBinary(`/api/reporting/export${commonQ}&format=xlsx`, token, `reporting-operativo.xlsx`);

  // Liquidación productor (documento entrega + interno), por productor y total
  await saveBinary(
    `/api/reporting/producer-settlement/pdf?variant=producer&fecha_desde=2026-05-01&fecha_hasta=2026-05-31&page=1&limit=100`,
    token,
    `liquidacion-productor-global.pdf`,
  );
  await saveBinary(
    `/api/reporting/producer-settlement/pdf?variant=internal&fecha_desde=2026-05-01&fecha_hasta=2026-05-31&page=1&limit=100`,
    token,
    `liquidacion-interna-global.pdf`,
  );
  for (const pid of ids.producerIds) {
    await saveBinary(
      `/api/reporting/producer-settlement/pdf?variant=producer&fecha_desde=2026-05-01&fecha_hasta=2026-05-31&productor_id=${pid}&page=1&limit=100`,
      token,
      `liquidacion-productor-${pid}.pdf`,
    );
    await saveBinary(
      `/api/reporting/producer-settlement/pdf?variant=internal&fecha_desde=2026-05-01&fecha_hasta=2026-05-31&productor_id=${pid}&page=1&limit=100`,
      token,
      `liquidacion-interna-${pid}.pdf`,
    );
  }

  // Excel extra por productor
  for (const pid of ids.producerIds) {
    await saveBinary(
      `/api/reporting/export?fecha_desde=2026-05-01&fecha_hasta=2026-05-31&productor_id=${pid}&page=1&limit=100&format=xlsx`,
      token,
      `reporting-productor-${pid}.xlsx`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


/**
 * Agente de impresión en PC de planta: consulta trabajos pendientes en Railway
 * y los envía a la Zebra local (mismo flujo que POST /print del servicio local).
 *
 * Variables de entorno:
 *   PACKING_API_URL     — ej. https://packing-system-production.up.railway.app
 *   PRINT_AGENT_API_KEY — misma clave que PRINT_AGENT_API_KEY en Railway
 *   ZEBRA_PRINTER_NAME  — opcional, override de impresora
 *   PRINT_POLL_MS       — intervalo (default 5000)
 *   LOCAL_PRINT_URL     — opcional, default http://127.0.0.1:3001
 */

const PRINT_POLL_MS = Number(process.env.PRINT_POLL_MS || 5000);
const API_BASE = String(process.env.PACKING_API_URL || process.env.RAILWAY_API_URL || '')
  .trim()
  .replace(/\/+$/, '');
const AGENT_KEY = String(process.env.PRINT_AGENT_API_KEY || '').trim();
const LOCAL_PRINT_URL = String(process.env.LOCAL_PRINT_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');

if (!API_BASE) {
  console.error('[plant-agent] Definí PACKING_API_URL (URL del backend en Railway).');
  process.exit(1);
}
if (!AGENT_KEY) {
  console.error('[plant-agent] Definí PRINT_AGENT_API_KEY (misma clave que en Railway).');
  process.exit(1);
}

async function fetchPending() {
  const url = `${API_BASE}/api/print-jobs/pending?limit=5`;
  const res = await fetch(url, {
    headers: { 'X-Print-Agent-Key': AGENT_KEY },
  });
  const raw = await res.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg =
      (body && typeof body.message === 'string' && body.message) ||
      (body && typeof body.error === 'string' && body.error) ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return Array.isArray(body?.jobs) ? body.jobs : [];
}

async function completeJob(id, ok, error, printer) {
  const url = `${API_BASE}/api/print-jobs/${id}/complete`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Print-Agent-Key': AGENT_KEY,
    },
    body: JSON.stringify({ ok, error: error || undefined, printer: printer || undefined }),
  });
  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`complete ${id}: HTTP ${res.status} ${raw.slice(0, 200)}`);
  }
}

async function printViaLocalService(job) {
  const res = await fetch(`${LOCAL_PRINT_URL}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: job.filename,
      zpl: job.zpl,
      printerName: job.printerName || process.env.ZEBRA_PRINTER_NAME || undefined,
      copies: job.copies ?? 1,
    }),
  });
  const raw = await res.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg = (body && body.message) || (body && body.error) || `HTTP ${res.status}`;
    throw new Error(String(msg));
  }
  if (body?.jobId) {
    return await waitLocalJob(body.jobId);
  }
  return { printer: body?.printer || job.printerName || null };
}

async function waitLocalJob(jobId, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await fetch(`${LOCAL_PRINT_URL}/jobs/${encodeURIComponent(jobId)}`);
    if (!res.ok) {
      await sleep(400);
      continue;
    }
    const data = await res.json();
    const st = data?.job?.status;
    if (st === 'done') {
      return { printer: data.job.printer || null };
    }
    if (st === 'error') {
      throw new Error(data.job.errorMessage || 'Error en servicio local.');
    }
    await sleep(500);
  }
  throw new Error('Timeout esperando impresión local.');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function processJob(job) {
  console.log(`[plant-agent] Imprimiendo job ${job.id} (${job.filename})…`);
  try {
    const result = await printViaLocalService(job);
    await completeJob(job.id, true, null, result.printer);
    console.log(`[plant-agent] OK job ${job.id}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[plant-agent] Error job ${job.id}:`, msg);
    try {
      await completeJob(job.id, false, msg);
    } catch (e2) {
      console.error(`[plant-agent] No se pudo marcar complete:`, e2);
    }
  }
}

async function tick() {
  try {
    const jobs = await fetchPending();
    for (const job of jobs) {
      await processJob(job);
    }
  } catch (err) {
    console.error('[plant-agent] Poll error:', err instanceof Error ? err.message : err);
  }
}

console.log(`[plant-agent] API=${API_BASE} local=${LOCAL_PRINT_URL} poll=${PRINT_POLL_MS}ms`);
void tick();
setInterval(() => {
  void tick();
}, PRINT_POLL_MS);

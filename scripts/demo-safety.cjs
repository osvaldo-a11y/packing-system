/* eslint-disable @typescript-eslint/no-require */
/**
 * Gates para seed/reset de demo: nunca apuntar a producción.
 */
const PRODUCTION_HOSTS = new Set(['packing-system-production.up.railway.app']);

function hostnameOf(urlOrHost) {
  try {
    const raw = String(urlOrHost || '').trim();
    if (!raw) return '';
    const withProto = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    return new URL(withProto).hostname.toLowerCase();
  } catch {
    return String(urlOrHost || '').toLowerCase();
  }
}

function assertNotProductionApi(apiBase) {
  const host = hostnameOf(apiBase);
  if (PRODUCTION_HOSTS.has(host)) {
    throw new Error(
      `ABORT: API_BASE apunta al host de producción (${host}). El seed/reset demo no puede ejecutarse ahí.`,
    );
  }
  if (host.includes('production') && host.includes('railway')) {
    throw new Error(`ABORT: API_BASE parece producción Railway (${host}).`);
  }
}

function assertDemoSandboxHealth(health) {
  if (!health || health.demo_sandbox !== true) {
    throw new Error(
      'ABORT: el API no reporta demo_sandbox=true. No se siembra ni resetea fuera del sandbox.',
    );
  }
}

module.exports = {
  PRODUCTION_HOSTS,
  hostnameOf,
  assertNotProductionApi,
  assertDemoSandboxHealth,
};

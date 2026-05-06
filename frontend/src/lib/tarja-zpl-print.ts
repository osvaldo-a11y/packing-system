import { apiFetch, apiJson, parseApiError } from '@/api';

export type TarjaLabelTemplate = 'compact' | 'standard' | 'detailed';

export const TARJA_LABEL_TEMPLATE_OPTIONS: { id: TarjaLabelTemplate; label: string }[] = [
  { id: 'compact', label: 'Resumida' },
  { id: 'standard', label: 'Estándar' },
  { id: 'detailed', label: 'Detallada' },
];

/** Textos fijos del modal (independientes del catálogo API). */
export const TARJA_TEMPLATE_UI: Record<
  TarjaLabelTemplate,
  { title: string; blurb: string }
> = {
  compact: {
    title: 'Resumida',
    blurb: 'ID grande y código de barras dominante.',
  },
  standard: {
    title: 'Estándar',
    blurb: 'Cliente, formato, fecha, tipo y código.',
  },
  detailed: {
    title: 'Detallada',
    blurb: 'Más datos operativos con layout ordenado.',
  },
};

export type TarjaTemplateCatalogItem = {
  id: TarjaLabelTemplate;
  title: string;
  description: string;
};

export function tarjaTemplateHelp(id: TarjaLabelTemplate): string {
  return TARJA_TEMPLATE_UI[id]?.blurb ?? '';
}

function fallbackTarjaTemplateCatalog(): TarjaTemplateCatalogItem[] {
  return TARJA_LABEL_TEMPLATE_OPTIONS.map((t) => ({
    id: t.id,
    title: t.label,
    description: tarjaTemplateHelp(t.id),
  }));
}

/** Catálogo desde el API (`GET /api/labels/templates`); si falla, usa texto local. */
export async function fetchTarjaTemplateCatalog(): Promise<TarjaTemplateCatalogItem[]> {
  try {
    const rows = await apiJson<TarjaTemplateCatalogItem[]>('/api/labels/templates', { method: 'GET' });
    if (!Array.isArray(rows) || rows.length === 0) return fallbackTarjaTemplateCatalog();
    const valid = rows.filter(
      (r) => r && (r.id === 'compact' || r.id === 'standard' || r.id === 'detailed'),
    ) as TarjaTemplateCatalogItem[];
    return valid.length ? valid : fallbackTarjaTemplateCatalog();
  } catch {
    return fallbackTarjaTemplateCatalog();
  }
}

export type LocalPrinterInfo = {
  name: string;
  isDefault: boolean;
  isZebra: boolean;
  dpi?: string | null;
};

type LocalPrintersResponse = {
  ok: boolean;
  message?: string;
  defaultPrinter?: string;
  printers?: LocalPrinterInfo[];
};

export async function fetchTarjaZpl(tarjaId: number, template: TarjaLabelTemplate): Promise<string> {
  const q = new URLSearchParams({ template }).toString();
  const res = await apiFetch(`/api/labels/tarja/${tarjaId}?${q}`, {
    method: 'GET',
    headers: { Accept: 'text/plain,*/*' },
    psSkipForbiddenRedirect: true,
  });
  if (!res.ok) {
    throw new Error(await parseApiError(res));
  }
  return res.text();
}

export function downloadZplFile(filename: string, zpl: string): void {
  const blob = new Blob([zpl], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export type ZebraPrintAttempt =
  | { mode: 'sent_to_local_service'; printer?: string; jobId?: string }
  | {
      mode: 'downloaded_fallback';
      reason: 'service_unavailable' | 'print_failed';
      filename: string;
      message?: string;
    };

type LocalServicePrintResponse = {
  ok?: boolean;
  queued?: boolean;
  jobId?: string;
  message?: string;
  printed_bytes?: number;
  printer?: string;
};

type LocalJobStatusResponse = {
  ok?: boolean;
  message?: string;
  job?: {
    status: string;
    printer?: string | null;
    errorMessage?: string | null;
  };
};

export const LAST_PRINT_STORAGE_KEY = 'pt_tags.print.last_job';

export type LastPrintPayload = {
  tarjaId: number;
  template: TarjaLabelTemplate;
  printerName?: string;
  copies: number;
  /** Si es `false`, no se rehidrata la impresora guardada en el próximo diálogo. */
  rememberPrinter?: boolean;
  /** Si es `false`, la próxima apertura usa plantilla estándar en lugar de la última. */
  rememberTemplate?: boolean;
};

export function saveLastPrintPayload(payload: LastPrintPayload): void {
  try {
    window.localStorage.setItem(LAST_PRINT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function loadLastPrintPayload(): LastPrintPayload | null {
  try {
    const raw = window.localStorage.getItem(LAST_PRINT_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as LastPrintPayload;
    if (typeof p.tarjaId !== 'number' || !p.template) return null;
    if (p.template !== 'compact' && p.template !== 'standard' && p.template !== 'detailed') return null;
    return {
      tarjaId: p.tarjaId,
      template: p.template,
      printerName: typeof p.printerName === 'string' && p.printerName.trim() ? p.printerName.trim() : undefined,
      copies: Math.min(99, Math.max(1, Math.floor(Number(p.copies)) || 1)),
      rememberPrinter: typeof p.rememberPrinter === 'boolean' ? p.rememberPrinter : true,
      rememberTemplate: typeof p.rememberTemplate === 'boolean' ? p.rememberTemplate : true,
    };
  } catch {
    return null;
  }
}

/** Nombre de impresora sugerido por variable de entorno (`VITE_ZEBRA_PRINTER_NAME`). */
export function getConfiguredZebraPrinterName(): string | undefined {
  const env = import.meta.env.VITE_ZEBRA_PRINTER_NAME?.trim();
  return env || undefined;
}

/**
 * Elige impresora para el diálogo: respeta la guardada si sigue existiendo, luego env, default Zebra
 * y por último la única Zebra detectada.
 */
export function suggestPrinterNameForTarjaPrint(opts: {
  printers: LocalPrinterInfo[];
  defaultPrinter?: string;
  persistedPrinterName?: string;
  envPreferredPrinter?: string;
}): string {
  const list = opts.printers;
  if (list.length === 0) return '';

  const byName = (n: string) => list.some((p) => p.name === n);
  const persisted = opts.persistedPrinterName?.trim();
  if (persisted && byName(persisted)) return persisted;

  const zebras = list.filter((p) => p.isZebra);
  const env = opts.envPreferredPrinter?.trim();
  if (env && byName(env)) return env;

  const def = opts.defaultPrinter?.trim();
  if (def && zebras.some((z) => z.name === def)) return def;

  const defaultMarked = zebras.find((z) => z.isDefault);
  if (defaultMarked) return defaultMarked.name;
  if (zebras.length === 1) return zebras[0].name;

  if (def && byName(def)) return def;

  return list[0]?.name ?? '';
}

/** Nombre efectivo para `POST /print`: respeta selección válida para el modo (solo Zebra o todas). */
export function resolvePrinterForLocalJob(opts: {
  selectedName: string;
  allPrinters: LocalPrinterInfo[];
  /** Lista filtrada a Zebras cuando el modal está en modo planta */
  zebraOnlyMode: boolean;
  defaultPrinter?: string;
  envPreferredPrinter?: string;
}): string {
  const zebras = opts.allPrinters.filter((p) => p.isZebra);
  const list = opts.zebraOnlyMode && zebras.length > 0 ? zebras : opts.allPrinters;

  const trimmed = opts.selectedName.trim();
  if (trimmed && list.some((p) => p.name === trimmed)) return trimmed;

  const suggested = suggestPrinterNameForTarjaPrint({
    printers: list.length > 0 ? list : opts.allPrinters,
    defaultPrinter: opts.defaultPrinter,
    envPreferredPrinter: opts.envPreferredPrinter,
  });
  return suggested;
}

/** Base del servicio (sin `/print`). Acepta URL absoluta o ruta `/…` (mismo origen, p. ej. proxy Vite). */
function normalizePrintServiceBase(raw: string): string {
  const t = raw.trim().replace(/\/+$/, '');
  const noPrint = t.replace(/\/print\/?$/i, '');
  const base = noPrint.replace(/\/+$/, '');
  if (!base) return 'http://localhost:3001';
  if (base.startsWith('http://') || base.startsWith('https://')) return base;
  if (base.startsWith('/') && typeof window !== 'undefined') {
    return `${window.location.origin}${base}`.replace(/\/+$/, '');
  }
  return base;
}

/** Última base que respondió a GET /printers (misma sesión de pestaña). */
let activePrintServiceBase: string | null = null;

/** Últimas bases intentadas (para mensaje de diagnóstico en UI). */
let lastPrintServiceProbeBases: string[] = [];

function stripTrailingSlash(b: string): string {
  return b.replace(/\/+$/, '');
}

/**
 * En **dev**: primero el proxy Vite (mismo origen, cualquier puerto 5173/5174/…),
 * luego `VITE_ZPL_PRINT_SERVICE_URL`, luego 127.0.0.1 y localhost.
 * Así no queda bloqueado por un `.env` apuntando a :3001 si el servicio no está aún levantado.
 */
export function printServiceCandidateBases(): string[] {
  const out: string[] = [];
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    out.push(stripTrailingSlash(`${window.location.origin}/local-zebra-print`));
  }
  const env = import.meta.env.VITE_ZPL_PRINT_SERVICE_URL?.trim();
  if (env) {
    const n = stripTrailingSlash(normalizePrintServiceBase(env));
    if (!out.includes(n)) out.push(n);
  }
  for (const b of ['http://127.0.0.1:3001', 'http://localhost:3001']) {
    if (!out.includes(b)) out.push(b);
  }
  return out;
}

/** Base usada para POST /print y GET /jobs/:id (tras un probe exitoso). */
export function getActivePrintServiceBase(): string | null {
  return activePrintServiceBase;
}

/** Texto corto para diagnóstico (modal impresión). */
export function getLastPrintServiceProbeSummary(): string {
  if (lastPrintServiceProbeBases.length === 0) return '';
  return lastPrintServiceProbeBases.join(' · ');
}

/**
 * Espera a que termine la cola local (`done` | `error`). El POST /print puede responder 202 de inmediato.
 */
async function waitForLocalPrintJob(
  jobId: string,
  base: string,
  opts?: { maxWaitMs?: number; pollMs?: number },
): Promise<{ ok: true; printer?: string } | { ok: false; message: string }> {
  const maxWait = opts?.maxWaitMs ?? 35_000;
  const pollMs = opts?.pollMs ?? 220;
  const deadline = Date.now() + maxWait;
  const root = stripTrailingSlash(base);

  while (Date.now() < deadline) {
    const ctrl = new AbortController();
    const tId = window.setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(`${root}/jobs/${encodeURIComponent(jobId)}`, {
        method: 'GET',
        signal: ctrl.signal,
      });
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, pollMs));
        continue;
      }
      const data = (await res.json()) as LocalJobStatusResponse;
      const st = data.job?.status;
      if (st === 'done') {
        const p =
          typeof data.job?.printer === 'string' && data.job.printer.trim() ? data.job.printer.trim() : undefined;
        return { ok: true, printer: p };
      }
      if (st === 'error') {
        const msg =
          (typeof data.job?.errorMessage === 'string' && data.job.errorMessage.trim()) ||
          'La impresora devolvió un error.';
        return { ok: false, message: msg };
      }
    } catch {
      /* conexión o parse; reintentar */
    } finally {
      window.clearTimeout(tId);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return { ok: false, message: 'Tiempo de espera agotado al imprimir (revisá la cola del servicio local).' };
}

/**
 * Envía ZPL al servicio local y espera a que termine el trabajo encolado.
 */
export async function sendZplToLocalPrintService(
  filename: string,
  zpl: string,
  printerName?: string,
  copies?: number,
  onQueued?: (jobId: string) => void,
): Promise<
  | { status: 'ok'; printer?: string; jobId?: string }
  | { status: 'unavailable'; message?: string }
  | { status: 'error'; message: string }
> {
  if (!activePrintServiceBase) {
    const warm = await getLocalPrinters();
    if (warm.status !== 'ok') {
      return {
        status: 'unavailable',
        message: warm.message?.trim() || 'No se pudo contactar al servicio de impresión local.',
      };
    }
  }
  const base = activePrintServiceBase!;
  const ctrl = new AbortController();
  const timeout = window.setTimeout(() => ctrl.abort(), 14_000);
  try {
    const res = await fetch(`${stripTrailingSlash(base)}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        filename,
        zpl,
        printerName: printerName || getConfiguredZebraPrinterName(),
        copies: copies ?? 1,
      }),
    });
    const raw = await res.text();
    let body: LocalServicePrintResponse | null = null;
    if (raw) {
      try {
        body = JSON.parse(raw) as LocalServicePrintResponse;
      } catch {
        body = null;
      }
    }
    if (!res.ok) {
      const message =
        (body?.message && String(body.message).trim()) || `Servicio local respondió ${res.status}`;
      return { status: 'error', message };
    }
    if (!body?.ok) {
      return { status: 'error', message: body?.message?.trim() || 'Respuesta inválida del servicio local.' };
    }

    const jobId = typeof body.jobId === 'string' && body.jobId.trim() ? body.jobId.trim() : undefined;
    if (jobId) {
      onQueued?.(jobId);
      const done = await waitForLocalPrintJob(jobId, base);
      if (!done.ok) {
        return { status: 'error', message: done.message };
      }
      return { status: 'ok', printer: done.printer, jobId };
    }

    const printer =
      typeof body.printer === 'string' && body.printer.trim() ? body.printer.trim() : undefined;
    return { status: 'ok', printer, jobId: undefined };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { status: 'unavailable', message: 'El servicio local no respondió a tiempo.' };
    }
    return { status: 'unavailable' };
  } finally {
    window.clearTimeout(timeout);
  }
}

/** Ajusta ^PQ de ZPL para varias copias (solo fallback descarga; el servicio local aplica copias al imprimir). */
export function applyZplCopies(zpl: string, copies: number): string {
  const n = Math.min(Math.max(Math.floor(Number(copies)) || 1, 1), 99);
  if (n === 1) return zpl;
  if (/\^PQ\s*\d+\s*,\s*0\s*,\s*1\s*,\s*Y/i.test(zpl)) {
    return zpl.replace(/\^PQ\s*\d+\s*,\s*0\s*,\s*1\s*,\s*Y/gi, `^PQ${n},0,1,Y`);
  }
  return zpl.replace(/\^XZ\s*$/m, `^PQ${n},0,1,Y\n^XZ`);
}

export async function getLocalPrinters(): Promise<{
  status: 'ok';
  printers: LocalPrinterInfo[];
  defaultPrinter?: string;
} | {
  status: 'unavailable' | 'error';
  message?: string;
}> {
  const candidates = printServiceCandidateBases();
  lastPrintServiceProbeBases = [...candidates];
  activePrintServiceBase = null;

  for (const rawBase of candidates) {
    const base = stripTrailingSlash(rawBase);
    const ctrl = new AbortController();
    const timeout = window.setTimeout(() => ctrl.abort(), 3200);
    try {
      const res = await fetch(`${base}/printers`, {
        method: 'GET',
        signal: ctrl.signal,
      });
      if (!res.ok) {
        continue;
      }
      const data = (await res.json()) as LocalPrintersResponse;
      if (data && data.ok === false) {
        continue;
      }
      activePrintServiceBase = base;
      return {
        status: 'ok',
        printers: Array.isArray(data.printers) ? data.printers : [],
        defaultPrinter: typeof data.defaultPrinter === 'string' ? data.defaultPrinter : undefined,
      };
    } catch {
      /* siguiente candidato */
    } finally {
      window.clearTimeout(timeout);
    }
  }

  return {
    status: 'unavailable',
    message:
      'No se detectó el servicio de impresión local en este equipo. Usá «Descargar ZPL» o iniciá el servicio en el PC de planta y volvé a abrir este diálogo.',
  };
}

/** Obtiene ZPL del API, intenta imprimir en localhost y usa `.zpl` como respaldo. */
export async function printTarjaZplOrDownload(
  tarjaId: number,
  options?: {
    template?: TarjaLabelTemplate;
    printerName?: string;
    copies?: number;
    /** Tras POST 202 cuando el trabajo ya está en la cola local (FIFO). */
    onPrintQueued?: (jobId: string) => void;
  },
): Promise<ZebraPrintAttempt> {
  const template = options?.template ?? 'standard';
  const copies = options?.copies ?? 1;
  const zplRaw = await fetchTarjaZpl(tarjaId, template);
  const name = `tarja-${tarjaId}.zpl`;
  const localPrint = await sendZplToLocalPrintService(
    name,
    zplRaw,
    options?.printerName,
    copies,
    options?.onPrintQueued,
  );
  if (localPrint.status === 'ok') {
    return {
      mode: 'sent_to_local_service',
      printer: localPrint.printer,
      jobId: localPrint.jobId,
    };
  }
  downloadZplFile(name, applyZplCopies(zplRaw, copies));
  if (localPrint.status === 'unavailable') {
    return {
      mode: 'downloaded_fallback',
      reason: 'service_unavailable',
      filename: name,
      message: localPrint.message,
    };
  }
  return {
    mode: 'downloaded_fallback',
    reason: 'print_failed',
    filename: name,
    message: localPrint.message,
  };
}

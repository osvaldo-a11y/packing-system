import { apiFetch, parseApiError } from '@/api';

export type TarjaLabelTemplate = 'compact' | 'standard' | 'detailed';

export const TARJA_LABEL_TEMPLATE_OPTIONS: { id: TarjaLabelTemplate; label: string }[] = [
  { id: 'compact', label: 'Resumida' },
  { id: 'standard', label: 'Estándar' },
  { id: 'detailed', label: 'Detallada' },
];

export function tarjaTemplateHelp(id: TarjaLabelTemplate): string {
  switch (id) {
    case 'compact':
      return 'Código tarja muy grande y código de barras dominante; formato en tamaño pequeño.';
    case 'standard':
      return 'Cliente, formato, fecha, tipo y código de barras con buen equilibrio visual.';
    case 'detailed':
      return 'Más datos operativos con layout ordenado, sin saturar la etiqueta.';
    default:
      return '';
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
  | { mode: 'sent_to_local_service'; printer?: string; jobId?: string; queued?: boolean }
  | { mode: 'downloaded_fallback'; reason: 'service_unavailable' | 'service_error'; message?: string };

type LocalServicePrintResponse = {
  ok?: boolean;
  queued?: boolean;
  jobId?: string;
  message?: string;
  printed_bytes?: number;
  printer?: string;
};

export const LAST_PRINT_STORAGE_KEY = 'pt_tags.print.last_job';

export type LastPrintPayload = {
  tarjaId: number;
  template: TarjaLabelTemplate;
  printerName?: string;
  copies: number;
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
    };
  } catch {
    return null;
  }
}

/**
 * Servicio local por defecto para Zebra en Windows.
 * Puede sobreescribirse con VITE_ZPL_PRINT_SERVICE_URL.
 */
function localPrintServiceUrl(): string {
  const env = import.meta.env.VITE_ZPL_PRINT_SERVICE_URL?.trim();
  return env || 'http://localhost:3001/print';
}

function localPrintersServiceUrl(): string {
  const base = localPrintServiceUrl();
  if (base.endsWith('/print')) return `${base.slice(0, -'/print'.length)}/printers`;
  return `${base.replace(/\/$/, '')}/printers`;
}

function preferredZebraPrinterName(): string | undefined {
  const env = import.meta.env.VITE_ZEBRA_PRINTER_NAME?.trim();
  return env || undefined;
}

/**
 * Envia ZPL al servicio local (localhost) con timeout corto para UX operativa.
 */
export async function sendZplToLocalPrintService(
  filename: string,
  zpl: string,
  printerName?: string,
  copies?: number,
): Promise<
  { status: 'ok'; printer?: string; jobId?: string; queued?: boolean } | { status: 'unavailable' } | { status: 'error'; message: string }
> {
  const ctrl = new AbortController();
  const timeout = window.setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(localPrintServiceUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        filename,
        zpl,
        printerName: printerName || preferredZebraPrinterName(),
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
    const printer =
      body && typeof body.printer === 'string' && body.printer.trim() ? body.printer.trim() : undefined;
    const jobId = typeof body.jobId === 'string' && body.jobId.trim() ? body.jobId.trim() : undefined;
    const queued = Boolean(body.queued);
    return { status: 'ok', printer, jobId, queued };
  } catch {
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
  const ctrl = new AbortController();
  const timeout = window.setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(localPrintersServiceUrl(), {
      method: 'GET',
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return { status: 'error', message: `Servicio local respondió ${res.status}` };
    }
    const data = (await res.json()) as LocalPrintersResponse;
    return {
      status: 'ok',
      printers: Array.isArray(data.printers) ? data.printers : [],
      defaultPrinter: typeof data.defaultPrinter === 'string' ? data.defaultPrinter : undefined,
    };
  } catch {
    return { status: 'unavailable' };
  } finally {
    window.clearTimeout(timeout);
  }
}

/** Obtiene ZPL del API, intenta imprimir en localhost y usa `.zpl` como respaldo. */
export async function printTarjaZplOrDownload(
  tarjaId: number,
  options?: { template?: TarjaLabelTemplate; printerName?: string; copies?: number },
): Promise<ZebraPrintAttempt> {
  const template = options?.template ?? 'standard';
  const copies = options?.copies ?? 1;
  const zplRaw = await fetchTarjaZpl(tarjaId, template);
  const name = `tarja-${tarjaId}.zpl`;
  const localPrint = await sendZplToLocalPrintService(name, zplRaw, options?.printerName, copies);
  if (localPrint.status === 'ok') {
    return {
      mode: 'sent_to_local_service',
      printer: localPrint.printer,
      jobId: localPrint.jobId,
      queued: localPrint.queued,
    };
  }
  downloadZplFile(name, applyZplCopies(zplRaw, copies));
  if (localPrint.status === 'unavailable') {
    return { mode: 'downloaded_fallback', reason: 'service_unavailable' };
  }
  return { mode: 'downloaded_fallback', reason: 'service_error', message: localPrint.message };
}

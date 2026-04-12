import { apiFetch } from './client';

function parseFilenameFromContentDisposition(cd: string | null, fallback: string): string {
  if (!cd) return fallback;
  const mStar = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(cd);
  if (mStar?.[1]) {
    try {
      return decodeURIComponent(mStar[1].trim().replace(/^["']|["']$/g, ''));
    } catch {
      return fallback;
    }
  }
  const m = /filename="([^"]+)"/i.exec(cd) ?? /filename=([^;\s]+)/i.exec(cd);
  return m?.[1]?.trim() ? m[1].trim().replace(/^["']|["']$/g, '') : fallback;
}

/** Descarga un PDF autenticado (GET) y dispara guardado en el navegador. */
export async function downloadPdf(path: string, filenameFallback: string): Promise<void> {
  const res = await apiFetch(path, {
    method: 'GET',
    psSkipForbiddenRedirect: true,
    headers: { Accept: 'application/pdf' },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t.slice(0, 400) || `Error ${res.status} ${res.statusText}`);
  }
  const ct = res.headers.get('Content-Type') ?? '';
  if (ct.includes('application/json') || ct.includes('text/html')) {
    const text = await res.text();
    throw new Error(text.slice(0, 400) || 'El servidor no devolvió un PDF');
  }
  const blob = await res.blob();
  const filename = parseFilenameFromContentDisposition(res.headers.get('Content-Disposition'), filenameFallback);
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

/** Descarga PDF vía POST (cuerpo JSON); útil para facturas con precios opcionales. */
export async function downloadPdfPost(path: string, filename: string, body: object = {}): Promise<void> {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    psSkipForbiddenRedirect: true,
  });
  if (!res.ok) {
    throw new Error(await parseApiError(res));
  }
  const blob = await res.blob();
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

export async function parseApiError(res: Response): Promise<string> {
  const raw = await res.text().catch(() => '');
  let body: Record<string, unknown> = {};
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }
  const m = body.message;
  const hint = body.hint;
  const msgStr = typeof m === 'string' ? m : Array.isArray(m) ? m.join(' ') : '';
  const base = msgStr || raw?.slice(0, 500) || res.statusText || 'Error';
  return typeof hint === 'string' && hint ? `${base} — ${hint}` : base;
}

/** GET/POST JSON; lanza Error con mensaje del API si !ok */
export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    throw new Error(await parseApiError(res));
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

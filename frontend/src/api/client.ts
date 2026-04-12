/** Base URL vacía = mismo origen (producción detrás de Nest). En dev, Vite hace proxy de /api. */
export function apiBase(): string {
  return import.meta.env.VITE_API_URL ?? '';
}

/** Token JWT guardado (misma fuente que envía `Authorization`). */
export function getToken(): string | null {
  return localStorage.getItem('ps_token');
}

/** true si el JWT tiene `exp` y ya venció (evita GET /api/... con token inválido → 401). */
export function isAccessTokenExpired(token: string): boolean {
  try {
    const part = token.split('.')[1];
    if (!part) return true;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const p = JSON.parse(json) as { exp?: number };
    if (typeof p.exp !== 'number') return false;
    return p.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem('ps_token', token);
  else localStorage.removeItem('ps_token');
}

export function parseJwtPayload(token: string): { username?: string; role?: string } {
  try {
    const part = token.split('.')[1];
    if (!part) return {};
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as { username?: string; role?: string };
  } catch {
    return {};
  }
}

/** Opciones de fetch del cliente; `psSkipForbiddenRedirect` no se envía al navegador. */
export type ApiFetchInit = RequestInit & {
  /** Evita navegar a #/forbidden (p. ej. export blob): el caller maneja el 403 sin desmontar la vista. */
  psSkipForbiddenRedirect?: boolean;
};

export async function apiFetch(path: string, init: ApiFetchInit = {}): Promise<Response> {
  const { psSkipForbiddenRedirect, ...rest } = init;
  const headers = new Headers(rest.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (rest.body && typeof rest.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${apiBase()}${path}`, { ...rest, headers });
  if (res.status === 401 && !path.includes('/auth/login')) {
    setToken(null);
    if (!window.location.hash.includes('login')) {
      window.location.hash = '#/login';
    }
  }
  if (res.status === 403 && !path.includes('/auth/login') && !psSkipForbiddenRedirect) {
    if (!window.location.hash.includes('forbidden')) {
      window.location.hash = '#/forbidden';
    }
  }
  return res;
}

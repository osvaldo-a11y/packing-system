/** Fecha local YYYY-MM-DD (para inputs type="date"). */
export function localDateYmd(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localDayStartMs(ymd: string): number {
  return new Date(`${ymd}T00:00:00`).getTime();
}

function localDayEndMs(ymd: string): number {
  return new Date(`${ymd}T23:59:59.999`).getTime();
}

/** Filtra un ISO/datetime por rango inclusive en horario local (from/to vacíos = sin límite). */
export function isoInLocalDateRange(iso: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  if (from && t < localDayStartMs(from)) return false;
  if (to && t > localDayEndMs(to)) return false;
  return true;
}

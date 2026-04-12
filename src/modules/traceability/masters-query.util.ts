/** Listados de mantenedores: por defecto solo activos; la UI admin pasa include_inactive=true. */
export function parseIncludeInactive(v?: string): boolean {
  return v === 'true' || v === '1' || v === 'yes';
}

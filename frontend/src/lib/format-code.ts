/** Clave estable para comparar / deduplicar códigos de formato (NxMoz o alias pint). */
export function formatCodeMatchKey(code: string): string {
  return code.trim().toLowerCase().replace(/^pinta\s+/, 'pint ');
}

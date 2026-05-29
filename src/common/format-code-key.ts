/**
 * Clave estable para comparar códigos de formato (NxOz, PINT REGULAR, pinta regular, etc.).
 * Debe coincidir con `frontend/src/lib/format-code.ts`.
 */
export function formatCodeMatchKey(code: string): string {
  return code.trim().toLowerCase().replace(/^pinta\s+/, 'pint ');
}

/** Expresión SQL (PostgreSQL) para la misma normalización en agregaciones. */
export function formatKeySql(columnExpr: string): string {
  return `LOWER(REGEXP_REPLACE(TRIM(${columnExpr}), '^pinta[[:space:]]+', 'pint ', 'i'))`;
}

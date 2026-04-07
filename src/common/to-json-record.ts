/** Plain object suitable for TypeORM `simple-json` / audit columns typed as Record<string, unknown>. */
export function toJsonRecord(value: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

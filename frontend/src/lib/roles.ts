export type AppRole = 'admin' | 'supervisor' | 'operator' | 'viewer';

export function isViewer(role: string | null | undefined): boolean {
  return role === 'viewer';
}

export function isAdmin(role: string | null | undefined): boolean {
  return role === 'admin';
}

export function canSupervise(role: string | null | undefined): boolean {
  return role === 'supervisor' || role === 'admin';
}

/** Puede modificar datos operativos (recepciones, procesos, despachos, etc.). */
export function canOperate(role: string | null | undefined): boolean {
  return role === 'operator' || role === 'supervisor' || role === 'admin';
}

/** Puede generar y exportar reportes (incluye viewer). */
export function canUseReporting(role: string | null | undefined): boolean {
  return (
    role === 'viewer' || role === 'operator' || role === 'supervisor' || role === 'admin'
  );
}

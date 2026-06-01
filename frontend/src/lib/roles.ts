export type AppRole = 'admin' | 'supervisor' | 'operator' | 'viewer';

export function isViewer(role: string | null | undefined): boolean {
  return role === 'viewer';
}

/** Sesión demo / observador: ver e imprimir, sin grabar. */
export function isReadOnlySession(role: string | null | undefined): boolean {
  return isViewer(role);
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

/** Puede descargar PDFs y encolar impresión (incluye viewer). */
export function canPrint(role: string | null | undefined): boolean {
  return canUseReporting(role);
}

/** Puede editar mantenedores (catálogos). */
export function canEditMasters(role: string | null | undefined): boolean {
  return canSupervise(role);
}

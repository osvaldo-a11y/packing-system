export const ROLES = {
  ADMIN: 'admin',
  SUPERVISOR: 'supervisor',
  OPERATOR: 'operator',
  VIEWER: 'viewer',
} as const;

export type AppRole = (typeof ROLES)[keyof typeof ROLES];

/** Lectura y reportes (sin altas ni ediciones operativas). */
export const READ_ACCESS_ROLES: AppRole[] = [
  ROLES.VIEWER,
  ROLES.OPERATOR,
  ROLES.SUPERVISOR,
  ROLES.ADMIN,
];

/** Operación en planta (no incluye viewer). */
export const OPERATE_ROLES: AppRole[] = [ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.ADMIN];

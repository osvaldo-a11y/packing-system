export const ROLES = {
  ADMIN: 'admin',
  SUPERVISOR: 'supervisor',
  OPERATOR: 'operator',
} as const;

export type AppRole = (typeof ROLES)[keyof typeof ROLES];

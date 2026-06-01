import type { ReactNode } from 'react';
import { useAuth } from '@/AuthContext';
import { canOperate } from '@/lib/roles';

/** Renderiza hijos solo si el rol puede modificar datos operativos (no viewer). */
export function OperateOnly({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  if (!canOperate(role)) return null;
  return <>{children}</>;
}

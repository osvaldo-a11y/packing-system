import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  icon: LucideIcon;
  label: ReactNode;
  children: ReactNode;
  className?: string;
  required?: boolean;
};

/**
 * Fila operacional compacta: [ICON] [LABEL] [CONTROL]
 * Layout mobile de referencia (no label-arriba / input-abajo).
 */
export function FieldRow({ icon: Icon, label, children, className, required }: Props) {
  return (
    <div
      className={cn(
        'flex min-h-[48px] items-center gap-3 border-b border-[var(--pb-border)] bg-[var(--pb-surface)] px-3 py-2 last:border-b-0',
        className,
      )}
    >
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-[var(--pb-olive)]" aria-hidden>
        <Icon className="h-4 w-4" strokeWidth={1.9} />
      </span>
      <div className="w-[38%] min-w-0 shrink-0 sm:w-[32%]">
        <p className="truncate text-[12px] font-semibold uppercase tracking-wide text-[var(--pb-text)]">
          {label}
          {required ? <span className="text-[var(--status-danger)]"> *</span> : null}
        </p>
      </div>
      <div className="min-w-0 flex-1 [&_input]:h-9 [&_input]:border-0 [&_input]:bg-transparent [&_input]:px-0 [&_input]:shadow-none [&_input]:outline-none [&_select]:h-9 [&_select]:w-full [&_select]:border-0 [&_select]:bg-transparent [&_select]:px-0 [&_select]:text-right [&_select]:outline-none">
        {children}
      </div>
    </div>
  );
}

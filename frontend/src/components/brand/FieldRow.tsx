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
 * Fila operacional GOLD MASTER: [ICON] [LABEL] [CONTROL]
 * Altura 52–56px; icon circle 32–34px.
 */
export function FieldRow({ icon: Icon, label, children, className, required }: Props) {
  return (
    <div
      className={cn(
        'flex min-h-[54px] items-center gap-3 border-b border-[var(--stone-200)]/80 bg-[var(--stone-50)] px-3.5 py-2.5 last:border-b-0',
        className,
      )}
    >
      <span
        className="inline-flex h-[33px] w-[33px] shrink-0 items-center justify-center rounded-full bg-[var(--stone-100)] text-[var(--ink-muted)]"
        aria-hidden
      >
        <Icon className="h-4 w-4" strokeWidth={1.85} />
      </span>
      <div className="w-[34%] min-w-0 shrink-0 sm:w-[30%]">
        <p className="truncate text-[13px] font-medium text-[var(--ink)]">
          {label}
          {required ? <span className="text-[var(--status-danger)]"> *</span> : null}
        </p>
      </div>
      <div className="min-w-0 flex-1 pr-1 text-right text-[13px] text-[var(--ink-muted)] [&_input]:h-9 [&_input]:border-0 [&_input]:bg-transparent [&_input]:px-0 [&_input]:pr-1 [&_input]:text-right [&_input]:shadow-none [&_input]:outline-none [&_select]:h-9 [&_select]:w-full [&_select]:border-0 [&_select]:bg-transparent [&_select]:px-0 [&_select]:pr-1 [&_select]:text-right [&_select]:outline-none [&_button]:pr-1">
        {children}
      </div>
    </div>
  );
}

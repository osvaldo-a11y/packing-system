import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { processTokens, type ProcessSemantic } from '@/lib/process-tokens';
import { cn } from '@/lib/utils';

type Props = {
  to: string;
  icon: LucideIcon;
  label: string;
  metric?: string;
  /** @deprecated La card completa es accionable; no mostrar hint. */
  hint?: string;
  semantic: ProcessSemantic;
  emphasis?: 'primary' | 'secondary';
  className?: string;
};

/** Selector operacional: superficie neutra + acento semántico (no dashboard pastel). */
export function OperationalModuleCard({
  to,
  icon: Icon,
  label,
  metric,
  semantic,
  emphasis = 'primary',
  className,
}: Props) {
  const tok = processTokens[semantic];
  return (
    <Link
      to={to}
      className={cn(
        'group relative flex min-h-[6.75rem] flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 transition-colors sm:min-h-[7.75rem] sm:p-4',
        'border-l-[3px] shadow-none',
        tok.stripe,
        'hover:border-slate-300 hover:bg-slate-50/80',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        tok.ring,
        'active:scale-[0.995]',
        emphasis === 'secondary' && 'opacity-95',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white sm:h-12 sm:w-12',
            tok.accent,
          )}
          aria-hidden
        >
          <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.25} />
        </span>
      </div>
      <div className="mt-2.5 min-w-0">
        <p className="text-[14px] font-semibold leading-snug tracking-tight text-slate-900 sm:text-[17px]">
          {label}
        </p>
        {metric ? (
          <p className={cn('mt-1 text-[15px] font-medium leading-snug tabular-nums sm:text-[16px]', tok.ink)}>
            {metric}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

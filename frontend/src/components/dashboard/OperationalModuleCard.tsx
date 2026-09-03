import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { processTokens, type ProcessSemantic } from '@/lib/process-tokens';
import { cn } from '@/lib/utils';

type Props = {
  to: string;
  icon: LucideIcon;
  label: string;
  metric?: string;
  hint?: string;
  semantic: ProcessSemantic;
  /** Jerarquía visual: operaciones principales más grandes */
  emphasis?: 'primary' | 'secondary';
  className?: string;
};

/** Tarjeta de módulo operacional (solo presentación + navegación). */
export function OperationalModuleCard({
  to,
  icon: Icon,
  label,
  metric,
  hint,
  semantic,
  emphasis = 'primary',
  className,
}: Props) {
  const tok = processTokens[semantic];
  return (
    <Link
      to={to}
      className={cn(
        'group flex min-h-[7.5rem] flex-col justify-between rounded-2xl border-2 border-l-4 p-4 transition-all sm:min-h-[8.5rem] sm:p-5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        tok.surface,
        tok.border,
        tok.stripe,
        tok.ring,
        'hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.99]',
        emphasis === 'primary' ? 'sm:col-span-1' : 'opacity-95',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm sm:h-14 sm:w-14',
            tok.accent,
          )}
          aria-hidden
        >
          <Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.25} />
        </span>
        {hint ? (
          <span
            className={cn(
              'text-right text-sm font-semibold tracking-wide opacity-90 transition-transform group-hover:translate-x-0.5',
              tok.ink,
            )}
          >
            {hint}
          </span>
        ) : null}
      </div>
      <div className="mt-3 min-w-0">
        <p className={cn('text-lg font-bold leading-tight sm:text-xl', tok.ink)}>{label}</p>
        {metric ? (
          <p className={cn('mt-1 text-xl font-semibold leading-snug tabular-nums sm:text-2xl', tok.ink)}>
            {metric}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

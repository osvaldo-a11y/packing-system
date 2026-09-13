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

/**
 * Botón de operación (no card de dashboard).
 * Icono protagonista + nombre + métrica; toda la superficie es clickeable.
 */
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
        'group relative flex min-h-[150px] cursor-pointer flex-col justify-between overflow-hidden rounded-[10px] border-2 p-3.5 transition-all duration-150 sm:min-h-[168px] sm:p-4',
        'border-l-[5px] shadow-none',
        tok.surface,
        tok.border,
        tok.stripe,
        'hover:-translate-y-1 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        tok.ring,
        'active:translate-y-0 active:scale-[0.99]',
        emphasis === 'secondary' && 'opacity-95',
        className,
      )}
    >
      <span
        className={cn(
          'inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-white sm:h-16 sm:w-16',
          tok.accent,
          'transition-transform duration-150 group-hover:scale-[1.04]',
        )}
        aria-hidden
      >
        <Icon className="h-7 w-7 sm:h-[34px] sm:w-[34px]" strokeWidth={2.4} />
      </span>
      <div className="mt-2.5 min-w-0">
        <p className="text-[17px] font-bold leading-snug tracking-tight text-slate-900 sm:text-[19px]">
          {label}
        </p>
        {metric ? (
          <p className={cn('mt-1 text-[15px] font-semibold leading-snug tabular-nums sm:text-[16px]', tok.ink)}>
            {metric}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

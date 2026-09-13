import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { OperationalPictogram } from '@/components/dashboard/OperationalPictogram';
import { processTokens, type ProcessSemantic } from '@/lib/process-tokens';
import { cn } from '@/lib/utils';

type Props = {
  to: string;
  icon?: LucideIcon;
  label: string;
  metric?: string;
  /** @deprecated La card completa es accionable; no mostrar hint. */
  hint?: string;
  semantic: ProcessSemantic;
  emphasis?: 'primary' | 'secondary';
  className?: string;
};

/**
 * Botón de operación Pinebloom: pictograma literal + nombre + métrica.
 * Superficies tintadas sutiles (no rainbow SidePro).
 */
export function OperationalModuleCard({
  to,
  icon,
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
        'group relative flex min-h-[150px] cursor-pointer flex-col justify-between overflow-hidden rounded-[12px] border p-3.5 transition-all duration-150 sm:min-h-[168px] sm:p-4',
        'border-l-[4px] shadow-none',
        tok.surface,
        tok.border,
        tok.stripe,
        'hover:-translate-y-0.5 hover:border-[hsl(var(--brand-primary) / 0.45)] hover:shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        tok.ring,
        'active:translate-y-0 active:scale-[0.99]',
        emphasis === 'secondary' && 'opacity-95',
        className,
      )}
    >
      <span
        className={cn(
          'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] sm:h-14 sm:w-14',
          'bg-[hsl(var(--brand-primary))] text-[hsl(var(--brand-primary-foreground))]',
          'transition-transform duration-150 group-hover:scale-[1.03]',
        )}
        aria-hidden
      >
        <OperationalPictogram
          semantic={semantic}
          primary={icon}
          iconClassName="text-current"
          className="text-current"
        />
      </span>
      <div className="mt-2.5 min-w-0">
        <p className="text-[17px] font-bold leading-snug tracking-tight text-[hsl(var(--brand-charcoal))] sm:text-[19px]">
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

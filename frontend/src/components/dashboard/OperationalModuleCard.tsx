import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { OperationalPictogram } from '@/components/dashboard/OperationalPictogram';
import { processTokens, type ProcessSemantic } from '@/lib/process-tokens';
import { cn } from '@/lib/utils';

type Props = {
  to: string;
  icon?: LucideIcon;
  label: string;
  metric?: string;
  description?: string;
  hint?: string;
  semantic: ProcessSemantic;
  emphasis?: 'primary' | 'secondary';
  className?: string;
};

/**
 * Card operacional del mockup Pinebloom:
 * [icono]  métrica + descripción  [chevron]
 * Superficie tintada suave, tipografía fuerte.
 */
export function OperationalModuleCard({
  to,
  icon,
  label,
  metric,
  description,
  hint,
  semantic,
  className,
}: Props) {
  const tok = processTokens[semantic];
  const subtitle = description || hint;

  return (
    <Link
      to={to}
      className={cn(
        'group relative flex min-h-[112px] items-center gap-3 overflow-hidden rounded-[14px] border px-3.5 py-3.5 transition-all duration-150 sm:min-h-[120px] sm:gap-4 sm:px-4 sm:py-4',
        tok.surface,
        tok.border,
        'hover:-translate-y-0.5 hover:shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-primary))]/40 focus-visible:ring-offset-2',
        'active:translate-y-0 active:scale-[0.995]',
        className,
      )}
    >
      <span
        className={cn(
          'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] sm:h-14 sm:w-14',
          tok.accent,
          'text-[hsl(var(--brand-primary-foreground))]',
        )}
        aria-hidden
      >
        <OperationalPictogram semantic={semantic} primary={icon} iconClassName="text-current" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-display text-[15px] font-semibold leading-tight text-[hsl(var(--brand-charcoal))] sm:text-[16px]">
          {label}
        </p>
        {metric ? (
          <p className={cn('mt-0.5 text-[20px] font-bold leading-none tabular-nums sm:text-[22px]', tok.ink)}>
            {metric}
          </p>
        ) : null}
        {subtitle ? (
          <p className="mt-1 text-[12px] leading-snug text-[hsl(var(--brand-muted))] sm:text-[13px]">{subtitle}</p>
        ) : null}
      </div>

      <span
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--brand-border))] bg-[hsl(var(--brand-surface-elevated))] text-[hsl(var(--brand-charcoal))] transition-colors group-hover:border-[hsl(var(--brand-primary))]/35 group-hover:bg-[hsl(var(--brand-primary-soft))]"
        aria-hidden
      >
        <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
      </span>
    </Link>
  );
}

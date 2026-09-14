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
 * Card operacional del mockup aprobado:
 * superficie tintada · pozo de icono suave · métrica fuerte · chevron circular.
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
        'group relative flex min-h-[118px] items-center gap-3 overflow-hidden rounded-[16px] border px-3.5 py-3.5 transition-all duration-150 sm:min-h-[128px] sm:gap-4 sm:px-4 sm:py-4',
        tok.surface,
        tok.border,
        'shadow-[0_1px_0_rgba(51,56,53,0.04)] hover:-translate-y-0.5 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-primary))]/35 focus-visible:ring-offset-2',
        'active:translate-y-0 active:scale-[0.995]',
        className,
      )}
    >
      <span
        className={cn(
          'inline-flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[14px] ring-1 ring-inset sm:h-14 sm:w-14',
          tok.surface,
          tok.ink,
          tok.border.replace('border-[', 'ring-['),
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
          <p className={cn('mt-1 text-[22px] font-bold leading-none tabular-nums tracking-tight sm:text-[24px]', tok.ink)}>
            {metric}
          </p>
        ) : null}
        {subtitle ? (
          <p className="mt-1.5 text-[12px] leading-snug text-[hsl(var(--brand-muted))] sm:text-[13px]">{subtitle}</p>
        ) : null}
      </div>

      <span
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--brand-border))] bg-[hsl(var(--brand-surface-elevated))] text-[hsl(var(--brand-charcoal))]/70 transition-colors group-hover:border-[hsl(var(--brand-primary))]/40 group-hover:bg-[hsl(var(--brand-primary-soft))] group-hover:text-[hsl(var(--brand-primary))]"
        aria-hidden
      >
        <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
      </span>
    </Link>
  );
}

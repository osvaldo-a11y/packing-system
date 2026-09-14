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
 * Card de módulo — estructura exacta de referencia:
 * [ICON WELL 54–58] [NOMBRE / MÉTRICA / HELPER] [ARROW CIRCLE]
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
        'group relative flex min-h-[110px] items-center gap-3 overflow-hidden rounded-[12px] border border-[var(--pb-border)] px-3 py-3 transition-colors sm:min-h-[118px] sm:gap-3.5 sm:px-3.5 sm:py-3.5',
        tok.surface,
        'hover:brightness-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb-olive)]/35 focus-visible:ring-offset-2',
        className,
      )}
    >
      <span
        className={cn(
          'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] sm:h-[54px] sm:w-[54px]',
          tok.iconWell,
        )}
        aria-hidden
      >
        <OperationalPictogram semantic={semantic} primary={icon} iconClassName="text-current" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-serif text-[16px] font-semibold leading-tight text-[var(--pb-charcoal)] sm:text-[18px]">
          {label}
        </p>
        {metric ? (
          <p className="mt-0.5 font-serif text-[24px] font-semibold leading-none tabular-nums tracking-tight text-[var(--pb-text)] sm:text-[28px]">
            {metric}
          </p>
        ) : null}
        {subtitle ? (
          <p className="mt-1 text-[12px] leading-snug text-[var(--pb-muted)] sm:text-[13px]">{subtitle}</p>
        ) : null}
      </div>

      <span
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface)] text-[var(--pb-charcoal)]/65 transition-colors group-hover:border-[var(--pb-olive)]/35 group-hover:text-[var(--pb-olive)]"
        aria-hidden
      >
        <ChevronRight className="h-4 w-4" strokeWidth={2} />
      </span>
    </Link>
  );
}

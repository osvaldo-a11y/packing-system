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
 * Card de módulo GOLD MASTER:
 * [ICON WELL] [NOMBRE / MÉTRICA / HELPER] [ARROW CIRCLE]
 * Desktop ~125–140px alto.
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
        'group relative flex min-h-[118px] items-start gap-2.5 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--stone-300)] px-2.5 py-2.5 transition-colors sm:min-h-[128px] sm:items-center sm:gap-3.5 sm:px-3.5 sm:py-3.5',
        tok.surface,
        'hover:brightness-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--olive-700)]/35 focus-visible:ring-offset-2',
        className,
      )}
    >
      <span
        className={cn(
          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] sm:h-[54px] sm:w-[54px]',
          tok.iconWell,
        )}
        aria-hidden
      >
        <OperationalPictogram semantic={semantic} primary={icon} iconClassName="text-current" />
      </span>

      <div className="min-w-0 flex-1 self-center">
        <p className="font-serif text-[14px] font-semibold leading-tight text-[var(--ink)] sm:text-[18px]">
          {label}
        </p>
        {metric ? (
          <p className="mt-0.5 font-serif text-[20px] font-semibold leading-none tabular-nums tracking-tight text-[var(--ink)] sm:text-[28px]">
            {metric}
          </p>
        ) : null}
        {subtitle ? (
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[var(--ink-muted)] sm:text-[13px]">{subtitle}</p>
        ) : null}
      </div>

      <span
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--stone-300)] bg-[var(--stone-50)] text-[var(--ink)]/65 transition-colors group-hover:border-[var(--olive-700)]/40 group-hover:text-[var(--olive-700)]"
        aria-hidden
      >
        <ChevronRight className="h-4 w-4" strokeWidth={2} />
      </span>
    </Link>
  );
}

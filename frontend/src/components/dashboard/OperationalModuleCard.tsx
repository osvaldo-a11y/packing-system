import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { OperationalPictogram } from '@/components/dashboard/OperationalPictogram';
import { processTokens, type ProcessSemantic } from '@/lib/process-tokens';
import { cn } from '@/lib/utils';

type Props = {
  to: string;
  label: string;
  metric?: string;
  description?: string;
  hint?: string;
  semantic: ProcessSemantic;
  emphasis?: 'primary' | 'secondary';
  className?: string;
};

/**
 * Card de módulo — réplica mock (well 56, KPI serif).
 */
export function OperationalModuleCard({
  to,
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
        'group relative flex min-h-[110px] items-center gap-3 overflow-hidden rounded-[10px] border border-[var(--stone-300)]/85 px-3 py-2.5 transition-colors sm:min-h-[118px] sm:gap-3.5 sm:px-3.5 sm:py-3',
        tok.surface,
        'hover:brightness-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--olive-700)]/35 focus-visible:ring-offset-2',
        className,
      )}
    >
      <span
        className={cn(
          'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] sm:h-[56px] sm:w-[56px]',
          tok.iconWell,
        )}
        aria-hidden
      >
        <OperationalPictogram semantic={semantic} />
      </span>

      <div className="min-w-0 flex-1 self-center pr-1">
        <p className="font-serif text-[15px] font-semibold leading-tight text-[var(--ink)] sm:text-[16.5px]">
          {label}
        </p>
        {metric ? (
          <p className="mt-0.5 font-serif text-[22px] font-bold leading-none tabular-nums tracking-tight text-[var(--ink)] sm:mt-1 sm:text-[26px]">
            {metric}
          </p>
        ) : null}
        {subtitle ? (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[var(--ink-muted)] sm:text-[12.5px]">
            {subtitle}
          </p>
        ) : null}
      </div>

      <span
        className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full border border-[var(--stone-300)] bg-white/85 text-[var(--ink)]/55 transition-colors group-hover:border-[var(--olive-700)]/40 group-hover:text-[var(--olive-700)] sm:h-[34px] sm:w-[34px]"
        aria-hidden
      >
        <ChevronRight className="h-4 w-4" strokeWidth={2.1} />
      </span>
    </Link>
  );
}

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

/** Card de módulo HOME — geometría referencia 140×84. */
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
        'group relative flex h-[140px] min-h-[140px] items-center gap-4 overflow-hidden rounded-[10px] border border-[var(--stone-300)]/85 px-4 py-3.5 transition-colors',
        tok.surface,
        'hover:brightness-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--olive-700)]/35 focus-visible:ring-offset-2',
        className,
      )}
    >
      <span
        className={cn(
          'inline-flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-[10px]',
          tok.iconWell,
        )}
        aria-hidden
      >
        <OperationalPictogram semantic={semantic} size={46} />
      </span>

      <div className="min-w-0 flex-1 self-center pr-1">
        <p className="font-serif text-[21px] font-semibold leading-tight text-[var(--ink)]">{label}</p>
        {metric ? (
          <p className="mt-1 font-serif text-[32px] font-bold leading-none tabular-nums tracking-tight text-[var(--ink)]">
            {metric}
          </p>
        ) : null}
        {subtitle ? (
          <p className="mt-1 line-clamp-2 text-[13.5px] leading-snug text-[var(--ink-muted)]">{subtitle}</p>
        ) : null}
      </div>

      <span
        className="ml-auto inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center self-center rounded-full border border-[var(--stone-300)] bg-white/85 text-[var(--ink)]/55 transition-colors group-hover:border-[var(--olive-700)]/40 group-hover:text-[var(--olive-700)]"
        aria-hidden
      >
        <ChevronRight className="h-[18px] w-[18px]" strokeWidth={2.1} />
      </span>
    </Link>
  );
}

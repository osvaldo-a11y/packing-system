import { BarChart3, Calendar, CalendarDays, CalendarRange, Filter, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PeriodOption<T extends string> = {
  key: T;
  label: string;
  icon?: LucideIcon;
};

type Props<T extends string> = {
  value: T;
  options: PeriodOption<T>[];
  onChange: (key: T) => void;
  moreLabel?: string;
  moreOpen?: boolean;
  onMoreClick?: () => void;
  className?: string;
};

const DEFAULT_ICONS: Record<string, LucideIcon> = {
  today: CalendarDays,
  hoy: CalendarDays,
  week: CalendarRange,
  semana: CalendarRange,
  accumulated: BarChart3,
  acumulado: BarChart3,
  all: Calendar,
  todos: Calendar,
};

/**
 * Filtros de periodo — altura 34–38px, activo olive solid.
 */
export function PeriodFilter<T extends string>({
  value,
  options,
  onChange,
  moreLabel,
  moreOpen,
  onMoreClick,
  className,
}: Props<T>) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5 sm:gap-2', className)}>
      {options.map((opt) => {
        const Icon = opt.icon ?? DEFAULT_ICONS[opt.key] ?? CalendarDays;
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={cn(
              'inline-flex h-[34px] items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition-colors sm:h-9 sm:px-3.5 sm:text-[13px]',
              active
                ? 'border-[var(--pb-olive)] bg-[var(--pb-olive)] text-white'
                : 'border-[var(--pb-border)] bg-[var(--pb-surface)] text-[var(--pb-text)] hover:bg-[var(--pb-olive-soft)]',
            )}
          >
            <Icon className="h-3.5 w-3.5 opacity-90" strokeWidth={2} aria-hidden />
            {opt.label}
          </button>
        );
      })}
      {onMoreClick && moreLabel ? (
        <>
          <span className="mx-0.5 hidden h-5 w-px bg-[var(--pb-border)] sm:inline-block" aria-hidden />
          <button
            type="button"
            onClick={onMoreClick}
            aria-expanded={moreOpen}
            className="inline-flex h-[34px] items-center gap-1.5 rounded-full border border-[var(--pb-border)] bg-transparent px-3 text-[12.5px] font-medium text-[var(--pb-muted)] hover:bg-[var(--pb-olive-soft)] hover:text-[var(--pb-text)] sm:h-9 sm:text-[13px]"
          >
            <Filter className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {moreLabel}
          </button>
        </>
      ) : null}
    </div>
  );
}

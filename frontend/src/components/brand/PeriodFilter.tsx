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

/** Filtros de periodo — activo olive-700 sólido. */
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
    <div className={cn('flex flex-wrap items-center gap-2 sm:gap-2.5', className)}>
      {options.map((opt) => {
        const Icon = opt.icon ?? DEFAULT_ICONS[opt.key] ?? CalendarDays;
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={cn(
              'inline-flex h-10 items-center gap-2 rounded-md border px-3 text-[13px] font-semibold transition-colors sm:h-[40px] sm:px-3.5 sm:text-[13.5px]',
              active
                ? 'border-[var(--olive-700)] bg-[var(--olive-700)] text-white'
                : 'border-[var(--stone-300)] bg-white text-[var(--ink)] hover:bg-[var(--sage-100)]',
            )}
          >
            <Icon className="h-4 w-4 opacity-90" strokeWidth={1.85} aria-hidden />
            {opt.label}
          </button>
        );
      })}
      {onMoreClick && moreLabel ? (
        <>
          <span className="mx-1 hidden h-5 w-px bg-[var(--stone-300)] sm:inline-block" aria-hidden />
          <button
            type="button"
            onClick={onMoreClick}
            aria-expanded={moreOpen}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--stone-300)] bg-white px-3 text-[13px] font-medium text-[var(--ink)] hover:bg-[var(--sage-100)] sm:h-[40px] sm:px-3.5 sm:text-[13.5px]"
          >
            <Filter className="h-4 w-4" strokeWidth={1.9} aria-hidden />
            {moreLabel}
          </button>
        </>
      ) : null}
    </div>
  );
}

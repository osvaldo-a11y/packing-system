import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

type Props = {
  to: string;
  icon: LucideIcon;
  title: string;
  when: string;
  detail?: string;
  statusLabel?: string;
  statusTone?: 'success' | 'info' | 'muted' | 'warning';
  user?: string;
  className?: string;
};

const TONE: Record<NonNullable<Props['statusTone']>, string> = {
  success: 'text-[var(--status-success)]',
  info: 'text-[var(--status-info)]',
  muted: 'text-[var(--pb-muted)]',
  warning: 'text-[var(--status-warning)]',
};

const DOT: Record<NonNullable<Props['statusTone']>, string> = {
  success: 'bg-[var(--status-success)]',
  info: 'bg-[var(--status-info)]',
  muted: 'bg-[var(--pb-muted)]',
  warning: 'bg-[var(--status-warning)]',
};

/**
 * Fila de bitácora rica: icono · tipo+folio · fecha · detalle · estado · usuario · chevron
 */
export function RecentActivityRow({
  to,
  icon: Icon,
  title,
  when,
  detail,
  statusLabel,
  statusTone = 'muted',
  user,
  className,
}: Props) {
  return (
    <Link
      to={to}
      className={cn(
        'grid grid-cols-[auto_minmax(0,1.2fr)_auto] items-center gap-x-3 gap-y-1 px-3.5 py-3 transition-colors hover:bg-[var(--pb-olive-soft)]/50 sm:grid-cols-[auto_minmax(0,1.1fr)_auto_minmax(0,1fr)_auto_auto_auto]',
        className,
      )}
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--pb-sage-soft)] text-[var(--pb-olive)]">
        <Icon className="h-4 w-4" strokeWidth={1.9} aria-hidden />
      </span>
      <p className="min-w-0 truncate text-[13px] font-semibold text-[var(--pb-text)]">{title}</p>
      <span className="hidden text-[11px] tabular-nums text-[var(--pb-muted)] sm:inline">{when}</span>
      <span className="col-span-2 min-w-0 truncate text-[12px] text-[var(--pb-muted)] sm:col-span-1 sm:text-[13px]">
        {detail || '—'}
      </span>
      {statusLabel ? (
        <span className={cn('hidden items-center gap-1.5 text-[12px] font-medium sm:inline-flex', TONE[statusTone])}>
          <span className={cn('h-1.5 w-1.5 rounded-full', DOT[statusTone])} aria-hidden />
          {statusLabel}
        </span>
      ) : (
        <span className="hidden sm:inline" />
      )}
      <span className="hidden max-w-[100px] truncate text-[12px] text-[var(--pb-muted)] sm:inline">
        {user || '—'}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--pb-muted)]" aria-hidden />
      <span className="col-span-3 text-[11px] text-[var(--pb-muted)] sm:hidden">{when}</span>
    </Link>
  );
}

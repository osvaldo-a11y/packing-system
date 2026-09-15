import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { pictogramForSemantic } from '@/components/dashboard/OperationalPictogram';
import type { ProcessSemantic } from '@/lib/process-tokens';
import { cn } from '@/lib/utils';

type Props = {
  to: string;
  semantic: ProcessSemantic;
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
  muted: 'text-[var(--ink-muted)]',
  warning: 'text-[var(--status-warning)]',
};

const DOT: Record<NonNullable<Props['statusTone']>, string> = {
  success: 'bg-[var(--status-success)]',
  info: 'bg-[var(--status-info)]',
  muted: 'bg-[var(--ink-muted)]',
  warning: 'bg-[var(--status-warning)]',
};

const ACTIVITY_WELL: Record<ProcessSemantic, string> = {
  reception: 'bg-[#D9DED3] text-[#536047]',
  process: 'bg-[#E5E1D8] text-[#59594F]',
  pt: 'bg-[#DCE5E9] text-[#485C66]',
  stock: 'bg-[#DCE5E9] text-[#485C66]',
  dispatch: 'bg-[#E9DFC9] text-[#6A5632]',
  materials: 'bg-[#D9DED3] text-[#536047]',
  error: 'bg-[#F0DADA] text-[var(--status-danger)]',
  admin: 'bg-[#E5E1D8] text-[#59594F]',
};

/** Fila de actividad editorial — geometría visible de la referencia. */
export function RecentActivityRow({
  to,
  semantic,
  title,
  when,
  detail,
  statusLabel,
  statusTone = 'muted',
  user,
  className,
}: Props) {
  const Icon = pictogramForSemantic(semantic);

  return (
    <Link
      to={to}
      className={cn(
        'grid h-9 min-h-9 grid-cols-[auto_minmax(0,1.2fr)_auto] items-center gap-x-6 gap-y-0.5 px-1.5 py-1 transition-colors hover:bg-[var(--sage-100)]/50 sm:grid-cols-[auto_minmax(0,1.2fr)_auto_minmax(0,1.05fr)_auto_auto_auto]',
        className,
      )}
    >
      <span
        className={cn(
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px]',
          ACTIVITY_WELL[semantic],
        )}
      >
        <Icon size={17} strokeWidth={1.85} />
      </span>
      <p className="min-w-0 truncate text-[13px] font-semibold text-[var(--ink)] sm:text-[13.5px]">{title}</p>
      <span className="hidden text-[11.5px] tabular-nums text-[var(--ink-muted)] sm:inline">{when}</span>
      <span className="col-span-2 min-w-0 truncate text-[12px] text-[var(--ink-muted)] sm:col-span-1 sm:text-[13px]">
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
      <span className="hidden max-w-[120px] truncate text-[12px] text-[var(--ink-muted)] sm:inline">
        {user || '—'}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ink-muted)]" aria-hidden />
      <span className="col-span-3 text-[11px] text-[var(--ink-muted)] sm:hidden">{when}</span>
    </Link>
  );
}

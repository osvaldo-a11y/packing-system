import { appBranding } from '@/lib/branding';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  compact?: boolean;
  showSeal?: boolean;
  claimLines?: string[];
};

/**
 * Hero editorial GOLD MASTER — Georgia + paisaje agrícola + sello.
 * Desktop ~155px con filtros.
 */
export function PinebloomHero({
  title,
  subtitle,
  actions,
  children,
  className,
  compact = false,
  showSeal = true,
  claimLines,
}: Props) {
  return (
    <header
      className={cn(
        'relative overflow-hidden border-b border-[var(--stone-200)] bg-[var(--stone-50)]',
        compact ? 'min-h-[132px] px-1 py-3 sm:min-h-[148px] sm:px-1 sm:py-3.5' : 'min-h-[148px] px-1 py-3.5 sm:min-h-[155px] sm:py-4',
        className,
      )}
    >
      <img
        src={appBranding.landscapeUrl}
        alt=""
        className="pointer-events-none absolute inset-y-0 right-0 h-full w-auto max-w-[68%] object-contain object-right opacity-[0.55] sm:max-w-[55%] sm:opacity-[0.7]"
        aria-hidden
      />
      <div className="relative z-[1] flex flex-col justify-between gap-2.5 sm:gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 max-w-[640px] space-y-1">
            <h1 className="font-serif text-[28px] font-semibold leading-[1.05] tracking-tight text-[var(--ink)] sm:text-[40px]">
              {title}
            </h1>
            {subtitle ? (
              <div className="text-[13px] leading-snug text-[var(--ink-muted)] sm:text-[15px]">{subtitle}</div>
            ) : null}
            {claimLines?.length ? (
              <p className="mt-2 max-w-[11rem] font-serif text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] text-[var(--ink-muted)] sm:hidden">
                {claimLines.map((line, i) => (
                  <span key={i} className="block">
                    {line}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {actions}
            {showSeal ? (
              <p className="hidden text-right font-serif text-[9px] font-semibold uppercase leading-relaxed tracking-[0.14em] text-[var(--ink-muted)] sm:block">
                <span className="block">PINEBLOOM FARMS</span>
                <span className="block opacity-80">
                  {appBranding.locationLine.toUpperCase()} | EST. {appBranding.estYear}
                </span>
              </p>
            ) : null}
          </div>
        </div>
        {children}
      </div>
    </header>
  );
}

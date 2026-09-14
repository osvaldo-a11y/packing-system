import { appBranding } from '@/lib/branding';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Altura hero desktop ~125–145px */
  compact?: boolean;
  showSeal?: boolean;
  /** Claim tipográfico bajo el paisaje (mobile sheet) */
  claimLines?: string[];
};

/**
 * Hero editorial Pinebloom: tipografía Georgia + watermark agrícola + sello.
 * Altura objetivo desktop con filtros: ~125–145px.
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
        'relative overflow-hidden rounded-[16px] border border-[var(--pb-border)] bg-[var(--pb-surface)]',
        compact
          ? 'px-4 py-3 sm:px-5 sm:py-3.5'
          : 'px-4 py-3.5 sm:px-5 sm:py-4',
        className,
      )}
    >
      <img
        src={appBranding.landscapeUrl}
        alt=""
        className="pointer-events-none absolute inset-y-0 right-0 h-full w-auto max-w-[58%] object-contain object-right opacity-[0.16] sm:max-w-[48%] sm:opacity-[0.18]"
        aria-hidden
      />
      <div className="relative z-[1] flex flex-col justify-between gap-2.5 sm:gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 max-w-[640px] space-y-0.5">
            <h1 className="font-serif text-[30px] font-semibold leading-none tracking-tight text-[var(--pb-text)] sm:text-[42px]">
              {title}
            </h1>
            {subtitle ? (
              <div className="font-serif text-[13px] leading-snug text-[var(--pb-muted)] sm:text-[15px]">
                {subtitle}
              </div>
            ) : null}
            {claimLines?.length ? (
              <p className="mt-2 max-w-[11rem] font-serif text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] text-[var(--pb-muted)] sm:hidden">
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
              <p className="hidden text-right font-serif text-[9px] font-semibold uppercase leading-relaxed tracking-[0.14em] text-[var(--pb-muted)] sm:block">
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

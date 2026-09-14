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
          ? 'min-h-[125px] px-4 py-4 sm:min-h-[135px] sm:px-5 sm:py-5'
          : 'min-h-[125px] px-4 py-5 sm:min-h-[140px] sm:px-6 sm:py-6',
        className,
      )}
    >
      <img
        src={appBranding.landscapeUrl}
        alt=""
        className="pointer-events-none absolute inset-y-0 right-0 h-full w-auto max-w-[62%] object-contain object-right opacity-[0.15] sm:max-w-[50%] sm:opacity-[0.17]"
        aria-hidden
      />
      <div className="relative z-[1] flex min-h-[inherit] flex-col justify-between gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 max-w-[640px] space-y-1">
            <h1 className="font-serif text-[30px] font-semibold leading-none tracking-tight text-[var(--pb-text)] sm:text-[42px]">
              {title}
            </h1>
            {subtitle ? (
              <div className="font-serif text-[14px] leading-snug text-[var(--pb-muted)] sm:text-[16px]">
                {subtitle}
              </div>
            ) : null}
            {claimLines?.length ? (
              <p className="mt-3 max-w-[11rem] font-serif text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] text-[var(--pb-muted)] sm:hidden">
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

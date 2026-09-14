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
  /** Amplía el paisaje al ~50% del ancho (Recepciones). */
  wideLandscape?: boolean;
};

/**
 * Hero editorial GOLD MASTER — Georgia + paisaje agrícola oficial (PNG).
 */
export function PinebloomHero({
  title,
  subtitle,
  actions,
  children,
  className,
  compact = false,
  showSeal = false,
  claimLines,
  wideLandscape = false,
}: Props) {
  return (
    <header
      className={cn(
        'relative overflow-hidden border-b border-[var(--stone-200)] bg-[var(--stone-50)]',
        compact
          ? 'min-h-[132px] px-1 py-2.5 sm:min-h-[148px] sm:px-1 sm:py-3'
          : 'min-h-[148px] px-1 py-3 sm:min-h-[160px] sm:py-3.5',
        className,
      )}
    >
      <img
        src={appBranding.landscapeUrl}
        alt=""
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 h-full w-[48%] max-w-none object-cover object-[88%_45%] opacity-100 contrast-[1.06] brightness-[0.97] sm:w-[50%]',
          wideLandscape && 'w-[54%] object-[82%_42%] sm:w-[56%]',
          '[mask-image:linear-gradient(to_right,transparent_0%,transparent_6%,black_28%,black_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,transparent_6%,black_28%,black_100%)]',
        )}
        aria-hidden
      />
      <div className="relative z-[1] flex flex-col justify-between gap-2 sm:gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 max-w-[58%]">
            <h1
              className={cn(
                'font-serif font-bold tracking-[-1.2px] text-[var(--ink)]',
                'text-[42px] sm:text-[48px]',
              )}
              style={{
                fontFamily: 'Georgia, "Times New Roman", Times, serif',
                lineHeight: 0.96,
                letterSpacing: '-1.2px',
                fontWeight: 700,
              }}
            >
              {title}
            </h1>
            {subtitle ? (
              <div
                className={cn(
                  'mt-1 leading-snug text-[var(--ink-muted)]',
                  compact ? 'text-[17px] sm:text-[19px]' : 'text-[15px] sm:text-[16px]',
                )}
              >
                {subtitle}
              </div>
            ) : null}
            {claimLines?.length ? (
              <p className="mt-2.5 max-w-[11rem] text-[10px] font-medium uppercase leading-[1.45] tracking-[0.18em] text-[var(--sage-700,#6B7A55)] sm:hidden">
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

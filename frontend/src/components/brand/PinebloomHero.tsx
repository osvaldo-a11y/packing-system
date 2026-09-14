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
  /** Amplía el paisaje (otras pantallas). */
  wideLandscape?: boolean;
};

/**
 * Hero editorial — PNG oficial como watermark (fade L + inferior).
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
          ? 'min-h-[124px] px-0 py-2 sm:min-h-[136px] sm:py-2.5'
          : 'min-h-[132px] px-0 py-2.5 sm:min-h-[144px] sm:py-3',
        className,
      )}
    >
      <img
        src={appBranding.landscapeUrl}
        alt=""
        className={cn(
          'pointer-events-none absolute right-[-3%] top-[48%] h-[235%] w-auto max-w-none -translate-y-1/2 object-cover object-[90%_46%] opacity-[0.62] contrast-[0.92] brightness-[1.04] saturate-[0.78]',
          wideLandscape && 'right-[-5%] h-[205%] opacity-[0.7] contrast-[0.95] brightness-[1.02]',
          '[mask-image:linear-gradient(to_right,transparent_0%,transparent_24%,rgba(0,0,0,0.1)_38%,rgba(0,0,0,0.42)_54%,black_72%,black_100%),linear-gradient(to_top,transparent_0%,rgba(0,0,0,0.3)_12%,black_34%,black_100%)]',
          '[-webkit-mask-image:linear-gradient(to_right,transparent_0%,transparent_24%,rgba(0,0,0,0.1)_38%,rgba(0,0,0,0.42)_54%,black_72%,black_100%),linear-gradient(to_top,transparent_0%,rgba(0,0,0,0.3)_12%,black_34%,black_100%)]',
          '[mask-composite:intersect] [-webkit-mask-composite:source-in]',
        )}
        aria-hidden
      />
      <div className="relative z-[1] flex flex-col justify-between gap-1.5 sm:gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 max-w-[58%]">
            <h1
              className={cn(
                'font-serif tracking-[-0.6px] text-[var(--ink)]',
                'text-[40px] sm:text-[44px]',
              )}
              style={{
                fontFamily: 'Georgia, "Times New Roman", Times, serif',
                lineHeight: 1.05,
                letterSpacing: '-0.6px',
                fontWeight: 600,
              }}
            >
              {title}
            </h1>
            {subtitle ? (
              <div
                className={cn(
                  'mt-1 font-serif leading-snug text-[var(--ink-muted)]/85',
                  compact ? 'text-[16px] sm:text-[17px]' : 'text-[14px] sm:text-[15px]',
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

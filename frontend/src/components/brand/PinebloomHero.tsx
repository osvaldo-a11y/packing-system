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
          ? 'min-h-[128px] px-1 py-2 sm:min-h-[140px] sm:px-1 sm:py-2.5'
          : 'min-h-[136px] px-1 py-2.5 sm:min-h-[148px] sm:py-3',
        className,
      )}
    >
      <img
        src={appBranding.landscapeUrl}
        alt=""
        className={cn(
          'pointer-events-none absolute right-[-2%] top-1/2 h-[255%] w-auto max-w-none -translate-y-1/2 object-cover object-[100%_42%] opacity-[0.86] contrast-[1.02] brightness-[1.01]',
          wideLandscape && 'right-[-4%] h-[220%] opacity-95',
          '[mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.04)_18%,rgba(0,0,0,0.42)_40%,black_68%,black_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.04)_18%,rgba(0,0,0,0.42)_40%,black_68%,black_100%)]',
        )}
        aria-hidden
      />
      <div className="relative z-[1] flex flex-col justify-between gap-1.5 sm:gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 max-w-[56%]">
            <h1
              className={cn(
                'font-serif font-bold tracking-[-1.2px] text-[var(--ink)]',
                'text-[40px] sm:text-[46px]',
              )}
              style={{
                fontFamily: 'Georgia, "Times New Roman", Times, serif',
                lineHeight: 0.94,
                letterSpacing: '-1.2px',
                fontWeight: 700,
              }}
            >
              {title}
            </h1>
            {subtitle ? (
              <div
                className={cn(
                  'mt-0.5 leading-snug text-[var(--ink-muted)]',
                  compact ? 'text-[17px] sm:text-[19px]' : 'text-[14px] sm:text-[15px]',
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

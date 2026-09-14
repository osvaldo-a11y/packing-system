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
 * Hero editorial GOLD MASTER — Georgia + paisaje agrícola oficial (PNG)
 * como watermark (no foto rectangular).
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
          ? 'min-h-[128px] px-0 py-2 sm:min-h-[140px] sm:py-2.5'
          : 'min-h-[136px] px-0 py-2.5 sm:min-h-[148px] sm:py-3',
        className,
      )}
    >
      <img
        src={appBranding.landscapeUrl}
        alt=""
        className={cn(
          'pointer-events-none absolute right-[-2%] top-1/2 h-[240%] w-auto max-w-none -translate-y-1/2 object-cover object-[100%_44%] opacity-[0.48] contrast-[0.88] brightness-[1.08] saturate-[0.82]',
          wideLandscape && 'right-[-4%] h-[210%] opacity-[0.62] contrast-[0.95] brightness-[1.02]',
          '[mask-image:linear-gradient(to_right,transparent_0%,transparent_22%,rgba(0,0,0,0.18)_40%,rgba(0,0,0,0.55)_58%,black_78%,black_100%),linear-gradient(to_top,transparent_0%,rgba(0,0,0,0.35)_18%,black_42%,black_100%)]',
          '[-webkit-mask-image:linear-gradient(to_right,transparent_0%,transparent_22%,rgba(0,0,0,0.18)_40%,rgba(0,0,0,0.55)_58%,black_78%,black_100%),linear-gradient(to_top,transparent_0%,rgba(0,0,0,0.35)_18%,black_42%,black_100%)]',
          '[mask-composite:intersect] [-webkit-mask-composite:source-in]',
        )}
        aria-hidden
      />
      <div className="relative z-[1] flex flex-col justify-between gap-1.5 sm:gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 max-w-[58%]">
            <h1
              className={cn(
                'font-serif tracking-[-0.8px] text-[var(--ink)]',
                'text-[40px] sm:text-[46px]',
              )}
              style={{
                fontFamily: 'Georgia, "Times New Roman", Times, serif',
                lineHeight: 1.02,
                letterSpacing: '-0.8px',
                fontWeight: 600,
              }}
            >
              {title}
            </h1>
            {subtitle ? (
              <div
                className={cn(
                  'mt-1 leading-snug text-[var(--ink-muted)]/90',
                  compact ? 'text-[16px] sm:text-[18px]' : 'text-[13px] sm:text-[14px]',
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

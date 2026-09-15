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
  /** Geometría medida HOME 1440×900 — no usar en Recepciones. */
  homeDesktop?: boolean;
  /** Geometría editorial aprobada para Recepciones, solo desde desktop. */
  receptionsDesktop?: boolean;
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
  homeDesktop = false,
  receptionsDesktop = false,
}: Props) {
  return (
    <header
      className={cn(
        'relative overflow-hidden border-b border-[var(--stone-200)] bg-[var(--stone-50)]',
        homeDesktop
          ? 'flex h-[200px] min-h-[200px] flex-col justify-between bg-[#F9F7F5] pb-[24px] pl-2 pr-0 pt-[25px]'
          : compact
            ? 'min-h-[124px] px-0 py-2 sm:min-h-[136px] sm:py-2.5'
            : 'min-h-[132px] px-0 py-2.5 sm:min-h-[144px] sm:py-3',
        receptionsDesktop && 'lg:h-[171px] lg:min-h-[171px] lg:pb-5 lg:pl-2 lg:pr-0 lg:pt-7',
        className,
      )}
    >
      <img
        src={appBranding.landscapeUrl}
        alt=""
        className={cn(
          homeDesktop
            ? cn(
                'pointer-events-none absolute right-0 top-0 h-full w-[640px] max-w-[54%] object-contain object-right opacity-[0.96] contrast-[1.04] brightness-[0.98] saturate-[0.65] mix-blend-multiply',
                '[mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.08)_5%,rgba(0,0,0,0.3)_16%,rgba(0,0,0,0.65)_32%,rgba(0,0,0,0.9)_50%,black_68%,black_100%),linear-gradient(to_bottom,transparent_0%,rgba(0,0,0,0.82)_6%,black_18%,black_82%,rgba(0,0,0,0.82)_95%,transparent_100%)]',
                '[-webkit-mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.08)_5%,rgba(0,0,0,0.3)_16%,rgba(0,0,0,0.65)_32%,rgba(0,0,0,0.9)_50%,black_68%,black_100%),linear-gradient(to_bottom,transparent_0%,rgba(0,0,0,0.82)_6%,black_18%,black_82%,rgba(0,0,0,0.82)_95%,transparent_100%)]',
                '[mask-composite:intersect] [-webkit-mask-composite:source-in]',
              )
            : cn(
                'pointer-events-none absolute right-[-2%] top-[48%] h-[240%] w-auto max-w-none -translate-y-1/2 object-cover object-[92%_45%] opacity-[0.78] contrast-[0.98] brightness-[1.0] saturate-[0.85]',
                wideLandscape && 'right-[-4%] h-[210%] opacity-[0.82]',
                receptionsDesktop &&
                  'lg:right-0 lg:top-1 lg:h-[118%] lg:w-[680px] lg:max-w-[62%] lg:translate-y-0 lg:object-contain lg:object-right lg:opacity-[0.78] lg:contrast-[0.96] lg:brightness-[1.03] lg:saturate-[0.68] lg:[mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.22)_12%,rgba(0,0,0,0.68)_28%,black_46%,black_100%),linear-gradient(to_top,transparent_0%,rgba(0,0,0,0.35)_10%,black_30%,black_100%)] lg:[-webkit-mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.22)_12%,rgba(0,0,0,0.68)_28%,black_46%,black_100%),linear-gradient(to_top,transparent_0%,rgba(0,0,0,0.35)_10%,black_30%,black_100%)]',
                '[mask-image:linear-gradient(to_right,transparent_0%,transparent_20%,rgba(0,0,0,0.12)_36%,rgba(0,0,0,0.5)_52%,black_70%,black_100%),linear-gradient(to_top,transparent_0%,rgba(0,0,0,0.35)_10%,black_30%,black_100%)]',
                '[-webkit-mask-image:linear-gradient(to_right,transparent_0%,transparent_20%,rgba(0,0,0,0.12)_36%,rgba(0,0,0,0.5)_52%,black_70%,black_100%),linear-gradient(to_top,transparent_0%,rgba(0,0,0,0.35)_10%,black_30%,black_100%)]',
                '[mask-composite:intersect] [-webkit-mask-composite:source-in]',
              ),
        )}
        aria-hidden
      />
      <div
        className={cn(
          'relative z-[1] flex flex-col',
          homeDesktop ? 'min-h-0 flex-1 justify-between gap-3' : 'justify-between gap-1.5 sm:gap-2',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className={cn('min-w-0', homeDesktop ? 'max-w-[56%]' : 'max-w-[58%]', receptionsDesktop && 'lg:max-w-[60%]')}>
            <h1
              className={cn(
                'font-serif text-[var(--ink)]',
                homeDesktop ? 'text-[62px] tracking-[-1px]' : 'text-[40px] tracking-[-0.6px] sm:text-[44px]',
                receptionsDesktop && 'lg:text-[66px] lg:tracking-[-0.9px]',
              )}
              style={{
                fontFamily: 'Georgia, "Times New Roman", Times, serif',
                lineHeight: homeDesktop ? 0.95 : 1.05,
                letterSpacing: homeDesktop ? '-1px' : '-0.6px',
                fontWeight: 600,
              }}
            >
              {title}
            </h1>
            {subtitle ? (
              <div
                className={cn(
                  'font-serif leading-snug text-[var(--ink-muted)]/85',
                  homeDesktop
                    ? 'mt-1.5 text-[25px]'
                    : compact
                      ? 'mt-1 text-[16px] sm:text-[17px]'
                      : 'mt-1 text-[14px] sm:text-[15px]',
                  receptionsDesktop && 'lg:mt-1 lg:text-[24px]',
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

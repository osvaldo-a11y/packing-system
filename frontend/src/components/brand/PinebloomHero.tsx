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
 * Hero editorial GOLD MASTER — Georgia + paisaje agrícola + sello.
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
  wideLandscape = false,
}: Props) {
  return (
    <header
      className={cn(
        'relative overflow-hidden border-b border-[var(--stone-200)] bg-[var(--stone-50)]',
        compact
          ? 'min-h-[136px] px-1 py-3 sm:min-h-[150px] sm:px-1 sm:py-3.5'
          : 'min-h-[152px] px-1 py-3.5 sm:min-h-[158px] sm:py-4',
        className,
      )}
    >
      <img
        src={appBranding.landscapeUrl}
        alt=""
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 h-full object-right',
          wideLandscape
            ? 'w-[52%] max-w-none object-cover opacity-[0.28] sm:opacity-[0.32]'
            : 'w-[50%] max-w-none object-cover opacity-[0.26] sm:opacity-[0.3]',
        )}
        aria-hidden
      />
      <div className="relative z-[1] flex flex-col justify-between gap-2 sm:gap-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 max-w-[640px] space-y-0.5">
            <h1
              className={cn(
                'font-serif font-bold leading-[0.98] tracking-[-1.2px] text-[var(--ink)]',
                'text-[40px] sm:text-[48px]',
              )}
              style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif' }}
            >
              {title}
            </h1>
            {subtitle ? (
              <div
                className={cn(
                  'leading-snug text-[var(--ink-muted)]',
                  compact ? 'text-[18px] sm:text-[20px]' : 'text-[15px] sm:text-[16px]',
                )}
              >
                {subtitle}
              </div>
            ) : null}
            {claimLines?.length ? (
              <p className="mt-2 max-w-[11rem] text-[10px] font-semibold uppercase leading-[1.45] tracking-[0.16em] text-[var(--ink-muted)] sm:hidden">
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

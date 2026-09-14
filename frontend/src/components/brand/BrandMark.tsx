import { NavLink } from 'react-router-dom';
import { appBranding } from '@/lib/branding';
import { cn } from '@/lib/utils';

type Props = {
  collapsed?: boolean;
  className?: string;
  tone?: 'onDark' | 'onLight';
  showLocation?: boolean;
};

/**
 * Marca Pinebloom: molino en marco cuadrado + wordmark (mockup aprobado).
 */
export function BrandMark({
  collapsed = false,
  className,
  tone = 'onDark',
  showLocation = true,
}: Props) {
  const { companyName, markUrl, monogram, locationLine, windmillUrl } = appBranding;
  const titleTone = tone === 'onDark' ? 'text-stone-50' : 'text-[hsl(var(--brand-charcoal))]';
  const subTone = tone === 'onDark' ? 'text-white/55' : 'text-[hsl(var(--brand-muted))]';

  return (
    <NavLink
      to="/"
      title={companyName}
      className={cn(
        'flex min-w-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-primary-glow))]/60',
        collapsed ? 'justify-center' : 'justify-start',
        className,
      )}
    >
      <span
        className={cn(
          'inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[3px] border',
          tone === 'onDark'
            ? 'border-white/60 bg-transparent text-[#F4F1EA]'
            : 'border-[hsl(var(--brand-primary))]/40 bg-[hsl(var(--brand-primary-soft))] text-[hsl(var(--brand-primary))]',
        )}
        aria-hidden
      >
        <img
          src={tone === 'onDark' ? windmillUrl : '/branding/pinebloom-windmill-dark.svg'}
          alt=""
          className="h-[22px] w-[22px] object-contain"
          onError={(e) => {
            e.currentTarget.src = markUrl;
          }}
        />
        <span className="sr-only">{monogram}</span>
      </span>
      {!collapsed ? (
        <span className="min-w-0 leading-tight">
          <span className={cn('block truncate font-display text-[12px] font-semibold tracking-[0.08em]', titleTone)}>
            {companyName.toUpperCase()}
          </span>
          {showLocation ? (
            <span className={cn('block truncate text-[9px] font-medium uppercase tracking-[0.2em]', subTone)}>
              {locationLine}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="sr-only">{companyName}</span>
      )}
    </NavLink>
  );
}

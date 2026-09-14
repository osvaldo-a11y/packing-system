import { NavLink } from 'react-router-dom';
import { appBranding } from '@/lib/branding';
import { cn } from '@/lib/utils';

type Props = {
  collapsed?: boolean;
  className?: string;
  tone?: 'onDark' | 'onLight';
  /** Mostrar slogan de ubicación bajo el nombre */
  showLocation?: boolean;
};

/**
 * Marca Pinebloom: molino + wordmark tipográfico (mockup aprobado).
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
  const iconTone = tone === 'onDark' ? 'text-stone-100' : 'text-[hsl(var(--brand-primary))]';

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
          'inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px]',
          tone === 'onDark' ? 'bg-white/8' : 'bg-[hsl(var(--brand-primary-soft))]',
          iconTone,
        )}
        aria-hidden
      >
        <img
          src={windmillUrl}
          alt=""
          className="h-7 w-7 object-contain"
          onError={(e) => {
            e.currentTarget.src = markUrl;
          }}
        />
        <span className="sr-only">{monogram}</span>
      </span>
      {!collapsed ? (
        <span className="min-w-0 leading-tight">
          <span className={cn('block truncate font-display text-[13px] font-semibold tracking-[0.06em]', titleTone)}>
            {companyName.toUpperCase()}
          </span>
          {showLocation ? (
            <span className={cn('block truncate text-[10px] font-medium uppercase tracking-[0.18em]', subTone)}>
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

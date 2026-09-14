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
 * Logo completo Pinebloom Farms (referencia): molino en marco + wordmark + Newton, GA.
 */
export function BrandMark({
  collapsed = false,
  className,
  tone = 'onDark',
  showLocation = true,
}: Props) {
  const { companyName, logoFullUrl, markUrl, monogram, locationLine, windmillUrl } = appBranding;
  const fullLogo = tone === 'onLight' ? '/branding/pinebloom-logo-full-dark.svg' : logoFullUrl;
  const windmill = tone === 'onLight' ? '/branding/pinebloom-windmill-dark.svg' : windmillUrl;

  if (!collapsed) {
    return (
      <NavLink
        to="/"
        title={companyName}
        className={cn(
          'flex min-w-0 items-center outline-none focus-visible:ring-2 focus-visible:ring-white/40',
          className,
        )}
      >
        <img
          src={fullLogo}
          alt={companyName}
          className="h-10 w-auto max-w-full object-contain object-left"
          onError={(e) => {
            e.currentTarget.src = markUrl;
          }}
        />
      </NavLink>
    );
  }

  return (
    <NavLink
      to="/"
      title={companyName}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-[3px] border outline-none focus-visible:ring-2 focus-visible:ring-white/40',
        tone === 'onDark' ? 'border-white/60' : 'border-[var(--pb-olive)]/40 bg-[var(--pb-olive-soft)]',
        className,
      )}
    >
      <img
        src={windmill}
        alt=""
        className="h-[22px] w-[22px] object-contain"
        onError={(e) => {
          e.currentTarget.src = markUrl;
        }}
      />
      <span className="sr-only">
        {companyName}
        {showLocation ? ` · ${locationLine}` : ''} ({monogram})
      </span>
    </NavLink>
  );
}

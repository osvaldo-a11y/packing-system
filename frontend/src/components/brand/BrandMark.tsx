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
 * Logo oficial Pinebloom Farms (GOLD MASTER).
 * Usa el PNG oficial en superficies claras.
 * En sidebar oscuro usa el lockup claro dedicado (misma composición).
 */
export function BrandMark({
  collapsed = false,
  className,
  tone = 'onDark',
  showLocation = true,
}: Props) {
  const {
    companyName,
    logoOfficialUrl,
    logoSidebarUrl,
    logoMobileUrl,
    markUrl,
    monogram,
    locationLine,
    windmillUrl,
    windmillMarkUrl,
  } = appBranding;

  if (!collapsed) {
    const src =
      tone === 'onDark'
        ? logoSidebarUrl
        : logoOfficialUrl || logoMobileUrl;

    return (
      <NavLink
        to="/"
        title={companyName}
        className={cn(
          'flex min-w-0 items-center outline-none focus-visible:ring-2 focus-visible:ring-[var(--olive-700)]/40',
          className,
        )}
      >
        <img
          src={src}
          alt={companyName}
          className={cn(
            'w-auto max-w-full object-contain object-left',
            tone === 'onDark' ? 'h-[62px] max-w-[196px]' : 'h-9 sm:h-10',
          )}
          onError={(e) => {
            e.currentTarget.src = tone === 'onLight' ? logoMobileUrl : markUrl;
          }}
        />
        {!showLocation ? <span className="sr-only">{locationLine}</span> : null}
      </NavLink>
    );
  }

  const windmill = tone === 'onDark' ? windmillUrl : windmillMarkUrl;

  return (
    <NavLink
      to="/"
      title={companyName}
      className={cn(
        'inline-flex h-10 w-9 items-center justify-center rounded-[3px] border outline-none focus-visible:ring-2 focus-visible:ring-[var(--olive-700)]/40',
        tone === 'onDark' ? 'border-white/55' : 'border-[var(--pine-950)]/35 bg-[var(--sage-100)]',
        className,
      )}
    >
      <img
        src={windmill}
        alt=""
        className="h-7 w-auto object-contain"
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

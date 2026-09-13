import { NavLink } from 'react-router-dom';
import { appBranding } from '@/lib/branding';
import { cn } from '@/lib/utils';

type Props = {
  collapsed?: boolean;
  className?: string;
  /** Variante en rail oscuro vs header/login claro */
  tone?: 'onDark' | 'onLight';
};

/**
 * Marca white-label: tile olive + wordmark (expandido) o mark (colapsado).
 * En rail oscuro no usamos el SVG wordmark (texto oscuro); usamos tipografía clara.
 */
export function BrandMark({ collapsed = false, className, tone = 'onDark' }: Props) {
  const { companyName, markUrl, monogram, productName } = appBranding;
  const titleTone = tone === 'onDark' ? 'text-stone-50' : 'text-[hsl(var(--brand-charcoal))]';
  const subTone = tone === 'onDark' ? 'text-white/55' : 'text-[hsl(var(--brand-muted))]';

  return (
    <NavLink
      to="/"
      title={companyName}
      className={cn(
        'flex min-w-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-primary))]/50',
        collapsed ? 'justify-center' : 'justify-start',
        className,
      )}
    >
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[hsl(var(--brand-primary))]"
        aria-hidden
      >
        <img
          src={markUrl}
          alt=""
          className="h-9 w-9 object-cover"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            const sib = e.currentTarget.nextElementSibling as HTMLElement | null;
            if (sib) sib.hidden = false;
          }}
        />
        <span hidden className="text-[11px] font-bold tracking-tight text-[hsl(var(--brand-primary-foreground))]">
          {monogram}
        </span>
      </span>
      {!collapsed ? (
        <span className="min-w-0 leading-tight">
          <span className={cn('block truncate text-[13px] font-semibold tracking-[0.04em]', titleTone)}>
            {companyName.toUpperCase()}
          </span>
          <span className={cn('block truncate text-[10px] font-medium uppercase tracking-[0.16em]', subTone)}>
            {productName}
          </span>
        </span>
      ) : (
        <span className="sr-only">{companyName}</span>
      )}
    </NavLink>
  );
}

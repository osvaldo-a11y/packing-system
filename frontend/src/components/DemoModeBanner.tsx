import { Eye, FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Props = {
  /** Sandbox de ventas (pueden grabar). */
  writable?: boolean;
};

/** Banner superior para sesión demo (lectura o sandbox escribible). */
export function DemoModeBanner({ writable = false }: Props) {
  const { t } = useTranslation('common');
  const Icon = writable ? FlaskConical : Eye;
  return (
    <div
      className={
        writable
          ? 'mb-4 flex gap-3 rounded-xl border border-amber-200/90 bg-gradient-to-r from-amber-50/95 to-orange-50/80 px-3.5 py-2.5 text-sm text-amber-950 shadow-sm ring-1 ring-amber-100/60'
          : 'mb-4 flex gap-3 rounded-xl border border-emerald-200/90 bg-gradient-to-r from-emerald-50/95 to-sky-50/80 px-3.5 py-2.5 text-sm text-emerald-950 shadow-sm ring-1 ring-emerald-100/60'
      }
      role="status"
    >
      <Icon
        className={
          writable
            ? 'mt-0.5 h-4 w-4 shrink-0 text-amber-700'
            : 'mt-0.5 h-4 w-4 shrink-0 text-emerald-700'
        }
        aria-hidden
      />
      <div className="min-w-0 space-y-0.5">
        <p className={writable ? 'font-semibold text-amber-950' : 'font-semibold text-emerald-950'}>
          {writable ? t('auth.sandboxBannerTitle') : t('auth.demoBannerTitle')}
        </p>
        <p
          className={
            writable
              ? 'text-[13px] leading-snug text-amber-900/90'
              : 'text-[13px] leading-snug text-emerald-900/90'
          }
        >
          {writable ? t('auth.sandboxBannerDesc') : t('auth.demoBannerDesc')}
        </p>
      </div>
    </div>
  );
}

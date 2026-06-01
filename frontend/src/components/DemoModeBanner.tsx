import { Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Banner superior para sesión viewer / demo (solo lectura). */
export function DemoModeBanner() {
  const { t } = useTranslation('common');
  return (
    <div
      className="mb-4 flex gap-3 rounded-xl border border-emerald-200/90 bg-gradient-to-r from-emerald-50/95 to-sky-50/80 px-3.5 py-2.5 text-sm text-emerald-950 shadow-sm ring-1 ring-emerald-100/60"
      role="status"
    >
      <Eye className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        <p className="font-semibold text-emerald-950">{t('auth.demoBannerTitle')}</p>
        <p className="text-[13px] leading-snug text-emerald-900/90">{t('auth.demoBannerDesc')}</p>
      </div>
    </div>
  );
}

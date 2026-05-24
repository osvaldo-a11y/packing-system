import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

/** Stock en cámara, repalet, packing lists — el alta del pallet es solo en Unidad PT. */
export function ExistenciasPtLayout() {
  const { t } = useTranslation('common');
  const { pathname } = useLocation();
  const detalleOpen = pathname.startsWith('/existencias-pt/detalle/');

  const tabs = [
    { to: '/existencias-pt/inventario', label: t('existenciasPt.layout.tabInventory'), end: true },
    { to: '/existencias-pt/repaletizar', label: t('existenciasPt.layout.tabRepallet') },
    { to: '/existencias-pt/packing-lists', label: t('existenciasPt.layout.tabPackingLists') },
  ];

  return (
    <div className="font-inter w-full min-w-0 flex-1 pb-6 pt-1 md:pt-0">
      <div className="mb-6 space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{t('existenciasPt.layout.moduleLabel')}</p>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{t('existenciasPt.layout.title')}</h1>
        <nav
          className="flex flex-wrap gap-1 rounded-2xl border border-slate-100 bg-white/90 p-1 shadow-sm"
          aria-label={t('existenciasPt.layout.navAriaLabel')}
        >
          {tabs.map(({ to, label, end = false }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => {
                const active = isActive || (detalleOpen && to === '/existencias-pt/inventario');
                return cn(
                  'rounded-xl px-4 py-2 text-[13px] font-medium transition-colors duration-150',
                  active
                    ? 'bg-slate-100/90 text-slate-900'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                );
              }}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="min-h-0 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

const tabs: Array<{ to: string; label: string; end?: boolean }> = [
  { to: '/existencias-pt/inventario', label: 'Inventario cámara', end: true },
  { to: '/existencias-pt/repaletizar', label: 'Repaletizaje' },
  { to: '/existencias-pt/packing-lists', label: 'Packing lists PT' },
];

/** Stock en cámara, repalet, packing lists — el alta del pallet es solo en Unidad PT. */
export function ExistenciasPtLayout() {
  const { pathname } = useLocation();
  const detalleOpen = pathname.startsWith('/existencias-pt/detalle/');

  return (
    <div className="font-inter w-full min-w-0 flex-1 pb-6 pt-1 md:pt-0">
      <div className="mb-6 space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Módulo</p>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Existencias PT</h1>
        <nav
          className="flex flex-wrap gap-1 rounded-2xl border border-slate-100 bg-white/90 p-1 shadow-sm"
          aria-label="Secciones existencias PT"
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

import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';

const tabs: Array<{ to: string; label: string; end?: boolean }> = [{ to: '/pt-tags', label: 'Alta y listado', end: true }];

/** Tarja TAR + vínculo proceso: único camino de alta de pallet hacia Existencias PT. */
export function UnidadPtLayout() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <div className="shrink-0 rounded-2xl border border-slate-100 bg-white/90 px-3 py-3 shadow-sm md:px-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Unidad PT</p>
        <nav className="flex flex-wrap gap-1" aria-label="Secciones Unidad PT">
          {tabs.map(({ to, label, end = false }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'rounded-xl px-3 py-1.5 text-[13px] font-medium transition-colors duration-150',
                  isActive
                    ? 'bg-slate-100/90 text-slate-900'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="min-h-0 min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}

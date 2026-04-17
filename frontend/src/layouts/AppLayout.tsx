import {
  BarChart3,
  BookOpen,
  Box,
  ChevronDown,
  ClipboardList,
  Factory,
  GitBranch,
  Import,
  Info,
  LayoutDashboard,
  Library,
  LogOut,
  Package,
  ScrollText,
  ShoppingCart,
  Tag,
  Truck,
  Warehouse,
} from 'lucide-react';
import { Fragment } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type NavIcon = typeof LayoutDashboard;

type NavItem = { to: string; label: string; icon: NavIcon; end?: boolean };

type NavGroup = { id: string; label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    id: 'principal',
    label: 'Principal',
    items: [{ to: '/', label: 'Inicio', icon: LayoutDashboard, end: true }],
  },
  {
    id: 'config',
    label: 'Planta y datos',
    items: [
      { to: '/plant', label: 'Planta', icon: Factory },
      { to: '/masters', label: 'Mantenedores', icon: Library },
    ],
  },
  {
    id: 'packaging',
    label: 'Packaging',
    items: [
      { to: '/packaging/materials', label: 'Materiales', icon: Package },
      { to: '/packaging/recipes', label: 'Recetas', icon: ScrollText },
      { to: '/packaging/consumptions', label: 'Consumos', icon: ClipboardList },
    ],
  },
  {
    id: 'operacion',
    label: 'Operación',
    items: [
      { to: '/receptions', label: 'Recepciones', icon: Import },
      { to: '/processes', label: 'Procesos', icon: Box },
      { to: '/pt-tags', label: 'Unidad PT', icon: Tag },
      { to: '/existencias-pt', label: 'Existencias PT', icon: Warehouse },
    ],
  },
  {
    id: 'comercial',
    label: 'Comercial y logística',
    items: [
      { to: '/sales-orders', label: 'Pedidos', icon: ShoppingCart },
      { to: '/dispatches', label: 'Despachos', icon: Truck },
    ],
  },
  {
    id: 'analisis',
    label: 'Análisis',
    items: [{ to: '/reporting', label: 'Reportes', icon: BarChart3 }],
  },
  {
    id: 'sistema',
    label: 'Ayuda',
    items: [
      { to: '/guide/sistema', label: 'Guía del sistema', icon: GitBranch },
      { to: '/about', label: 'Acerca', icon: Info },
    ],
  },
];

const navItemClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium leading-snug transition-colors duration-150',
    isActive
      ? 'bg-slate-100/90 text-slate-900'
      : 'text-slate-600 hover:bg-slate-50/90 hover:text-slate-900',
  );

const navIconClass = (isActive: boolean) =>
  cn(
    'h-[15px] w-[15px] shrink-0 stroke-[1.75] transition-colors',
    isActive ? 'text-slate-800' : 'text-slate-400 group-hover:text-slate-600',
  );

export function AppLayout() {
  const { username, role, logout } = useAuth();
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-[100dvh] min-w-0 flex-1 bg-[hsl(210_20%_97%)]">
      <aside className="sticky top-0 z-30 hidden h-[100dvh] max-h-[100dvh] w-[220px] shrink-0 flex-col border-r border-slate-200/50 bg-white md:flex">
        <div className="flex h-[52px] shrink-0 items-center border-b border-slate-100 px-4">
          <NavLink
            to="/"
            className="text-[15px] font-semibold tracking-tight text-slate-900 transition-opacity hover:opacity-90"
          >
            Pinebloom <span className="text-primary">Packing</span>
          </NavLink>
        </div>
        <nav
          className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto overscroll-contain px-2 py-2 [scrollbar-width:thin]"
          aria-label="Navegación principal"
        >
          {navGroups.map((group, gi) => (
            <div key={group.id} className={cn(gi > 0 && 'mt-3 border-t border-slate-100/80 pt-3')}>
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{group.label}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <NavLink to={item.to} end={item.end} className={navItemClass}>
                        {({ isActive }) => (
                          <>
                            <Icon className={navIconClass(isActive)} aria-hidden />
                            <span>{item.label}</span>
                          </>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <div className="mt-auto border-t border-slate-100/80 pt-2">
            <a
              href="/api/docs"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
            >
              <BookOpen className="h-[15px] w-[15px] shrink-0 stroke-[1.75] text-slate-400" aria-hidden />
              API docs
            </a>
          </div>
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-12 items-center justify-between gap-3 border-b border-slate-200/50 bg-white/90 px-4 backdrop-blur-md md:hidden">
          <NavLink to="/" className="text-[15px] font-semibold tracking-tight text-slate-900">
            Pinebloom <span className="text-primary">Packing</span>
          </NavLink>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-lg border-slate-200/80 bg-white text-[13px] font-medium shadow-sm">
                Menú
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[min(70vh,520px)] w-56 overflow-y-auto">
              {navGroups.map((group) => (
                <Fragment key={group.id}>
                  <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                    {group.label}
                  </DropdownMenuLabel>
                  {group.items.map((item) => (
                    <DropdownMenuItem key={item.to} asChild className="cursor-pointer rounded-md text-[13px]">
                      <NavLink to={item.to} end={item.end}>
                        {item.label}
                      </NavLink>
                    </DropdownMenuItem>
                  ))}
                </Fragment>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer rounded-md text-[13px]">
                <a href="/api/docs" target="_blank" rel="noreferrer">
                  API docs
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => logout()}
                className="cursor-pointer rounded-md text-[13px] text-destructive focus:text-destructive"
              >
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <header className="hidden h-12 shrink-0 items-center justify-end border-b border-slate-200/50 bg-white/85 px-5 backdrop-blur-md md:flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-2 rounded-lg px-2.5 text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
              >
                <span className="max-w-[160px] truncate text-[13px] font-medium text-slate-800">{username}</span>
                <Badge variant="secondary" className="h-5 border-0 bg-slate-100/90 px-1.5 text-[11px] font-medium capitalize text-slate-600">
                  {role}
                </Badge>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-slate-900">{username}</span>
                  <span className="text-xs text-slate-500 capitalize">{role}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout()} className="gap-2 text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="min-h-0 flex-1 overflow-x-auto overflow-y-auto px-3 py-4 md:px-4 md:py-5 lg:px-5 lg:py-6">
          <div
            key={pathname}
            className="animate-route-content mx-auto w-full max-w-full pb-6 md:pb-8"
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

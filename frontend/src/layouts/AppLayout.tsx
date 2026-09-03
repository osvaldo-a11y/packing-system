import {
  BarChart3,
  BookOpen,
  Box,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Factory,
  GitBranch,
  Import,
  Info,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  Package,
  ScrollText,
  ShoppingCart,
  Tag,
  Truck,
  Upload,
  Warehouse,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { DemoModeBanner } from '@/components/DemoModeBanner';
import { useAuth } from '@/AuthContext';
import { brandMarkParts } from '@/lib/branding';
import { isAdmin, isReadOnlySession } from '@/lib/roles';
import { useDemoInfo } from '@/api/demoInfo';
import { LanguageToggle } from '@/components/LanguageToggle';
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

type NavItem = {
  to: string;
  label: string;
  icon: NavIcon;
  end?: boolean;
  /** Mayor peso visual en operación */
  emphasize?: boolean;
};

type NavGroup = { id: string; label: string; items: NavItem[]; emphasize?: boolean };

function getNavGroups(t: (key: string) => string): NavGroup[] {
  return [
    {
      id: 'operacion',
      label: t('nav.groups.operacion'),
      emphasize: true,
      items: [
        { to: '/', label: t('nav.items.inicio'), icon: LayoutDashboard, end: true, emphasize: true },
        { to: '/receptions', label: t('nav.items.recepciones'), icon: Import, emphasize: true },
        { to: '/processes', label: t('nav.items.procesos'), icon: Box, emphasize: true },
        { to: '/pt-tags', label: t('nav.items.unidadPt'), icon: Tag, emphasize: true },
        { to: '/existencias-pt', label: t('nav.items.existenciasPt'), icon: Warehouse, emphasize: true },
        { to: '/dispatches', label: t('nav.items.despachos'), icon: Truck, emphasize: true },
      ],
    },
    {
      id: 'packaging',
      label: t('nav.groups.packaging'),
      items: [
        { to: '/packaging/materials', label: t('nav.items.materiales'), icon: Package },
        { to: '/packaging/kardex', label: t('nav.items.kardex'), icon: ScrollText },
        { to: '/packaging/recipes', label: t('nav.items.recetas'), icon: ClipboardList },
        { to: '/packaging/consumptions', label: t('nav.items.consumos'), icon: BarChart3 },
      ],
    },
    {
      id: 'comercial',
      label: t('nav.groups.comercial'),
      items: [{ to: '/sales-orders', label: t('nav.items.pedidos'), icon: ShoppingCart }],
    },
    {
      id: 'gestion',
      label: t('nav.groups.gestion'),
      items: [{ to: '/reporting', label: t('nav.items.reportes'), icon: BarChart3 }],
    },
    {
      id: 'config',
      label: t('nav.groups.config'),
      items: [
        { to: '/masters', label: t('nav.items.mantenedores'), icon: Library },
        { to: '/plant', label: t('nav.items.planta'), icon: Factory },
      ],
    },
    {
      id: 'sistema',
      label: t('nav.groups.sistema'),
      items: [
        { to: '/guide/sistema', label: t('nav.items.guia'), icon: GitBranch },
        { to: '/about', label: t('nav.items.acerca'), icon: Info },
      ],
    },
  ];
}

function BrandWordmark({ className }: { className?: string }) {
  const { company, product } = brandMarkParts();
  return (
    <span className={cn('font-semibold tracking-tight text-slate-900', className)}>
      {company} <span className="text-primary">{product}</span>
    </span>
  );
}

function NavList({
  groups,
  collapsed,
  onNavigate,
  isAdminRole,
  t,
}: {
  groups: NavGroup[];
  collapsed: boolean;
  onNavigate?: () => void;
  isAdminRole: boolean;
  t: (k: string) => string;
}) {
  return (
    <nav
      className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto overscroll-contain px-2 py-2 [scrollbar-width:thin]"
      aria-label={t('nav.ariaMain')}
    >
      {groups.map((group, gi) => (
        <div key={group.id} className={cn(gi > 0 && 'mt-3 border-t border-slate-100/80 pt-3')}>
          {!collapsed ? (
            <p
              className={cn(
                'mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em]',
                group.emphasize ? 'text-slate-500' : 'text-slate-400',
              )}
            >
              {group.label}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    title={collapsed ? item.label : undefined}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-2.5 rounded-lg px-2.5 transition-colors duration-150',
                        item.emphasize ? 'py-2.5 text-[14px] font-semibold' : 'py-1.5 text-[13px] font-medium',
                        isActive
                          ? 'bg-slate-100 text-slate-900'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                        collapsed && 'justify-center px-2',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          className={cn(
                            'shrink-0 stroke-[2]',
                            item.emphasize ? 'h-[18px] w-[18px]' : 'h-[15px] w-[15px]',
                            isActive ? 'text-slate-800' : 'text-slate-400 group-hover:text-slate-600',
                          )}
                          aria-hidden
                        />
                        {!collapsed ? <span className="truncate">{item.label}</span> : null}
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {isAdminRole ? (
        <div className="mt-3 border-t border-slate-100/80 pt-3">
          {!collapsed ? (
            <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              {t('nav.groups.admin')}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            <li>
              <NavLink
                to="/bulk-import"
                title={collapsed ? t('nav.items.cargaMasiva') : undefined}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                    isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50',
                    collapsed && 'justify-center px-2',
                  )
                }
              >
                <Upload className="h-[15px] w-[15px] shrink-0 text-slate-400" aria-hidden />
                {!collapsed ? <span>{t('nav.items.cargaMasiva')}</span> : null}
              </NavLink>
            </li>
          </ul>
        </div>
      ) : null}
      <div className="mt-auto border-t border-slate-100/80 pt-2">
        <a
          href="/api/docs"
          target="_blank"
          rel="noreferrer"
          className={cn(
            'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800',
            collapsed && 'justify-center px-2',
          )}
          title={collapsed ? t('nav.items.apiDocs') : undefined}
        >
          <BookOpen className="h-[15px] w-[15px] shrink-0 text-slate-400" aria-hidden />
          {!collapsed ? t('nav.items.apiDocs') : null}
        </a>
      </div>
    </nav>
  );
}

export function AppLayout() {
  const { t } = useTranslation('common');
  const navGroups = getNavGroups(t);
  const { username, role, logout } = useAuth();
  const isAdminRole = isAdmin(role);
  const readOnlySession = isReadOnlySession(role);
  const { data: demoInfo } = useDemoInfo(Boolean(username));
  const sandboxWritable = Boolean(demoInfo?.sandbox && demoInfo?.writable);
  const showDemoBanner = readOnlySession || sandboxWritable;
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.title = brandMarkParts().company + ' ' + brandMarkParts().product;
  }, []);

  return (
    <div className="flex min-h-[100dvh] min-w-0 flex-1 bg-[hsl(210_20%_97%)]">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'sticky top-0 z-30 hidden h-[100dvh] max-h-[100dvh] shrink-0 flex-col border-r border-slate-200/60 bg-white transition-[width] duration-200 md:flex',
          collapsed ? 'w-[72px]' : 'w-[248px]',
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-1 border-b border-slate-100 px-3">
          {!collapsed ? (
            <NavLink to="/" className="min-w-0 truncate text-[15px] transition-opacity hover:opacity-90">
              <BrandWordmark />
            </NavLink>
          ) : (
            <NavLink to="/" className="mx-auto text-sm font-bold text-primary" title={brandMarkParts().company}>
              {brandMarkParts().company.slice(0, 1)}
            </NavLink>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0 text-slate-500"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
        <NavList groups={navGroups} collapsed={collapsed} isAdminRole={isAdminRole} t={t} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            aria-label={t('nav.closeMenu')}
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(100%,280px)] flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-slate-100 px-3">
              <NavLink to="/" className="text-[15px]" onClick={() => setMobileOpen(false)}>
                <BrandWordmark />
              </NavLink>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setMobileOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <NavList
              groups={navGroups}
              collapsed={false}
              isAdminRole={isAdminRole}
              t={t}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200/50 bg-white/95 px-3 backdrop-blur-md sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0 md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label={t('nav.openMenu')}
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div className="min-w-0 md:hidden">
              <BrandWordmark className="truncate text-[14px]" />
            </div>
            <div className="hidden min-w-0 md:block">
              <p className="truncate text-[13px] font-medium text-slate-700">{brandMarkParts().company}</p>
              <p className="truncate text-[11px] text-slate-400">{t('nav.headerHint')}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-2 rounded-lg px-2.5 text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                >
                  <span className="max-w-[120px] truncate text-[13px] font-medium text-slate-800 sm:max-w-[160px]">
                    {username}
                  </span>
                  <Badge
                    variant="secondary"
                    className="hidden h-5 border-0 bg-slate-100/90 px-1.5 text-[11px] font-medium capitalize text-slate-600 sm:inline-flex"
                  >
                    {role}
                  </Badge>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-slate-900">{username}</span>
                    <span className="text-xs capitalize text-slate-500">{role}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout()} className="gap-2 text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4" />
                  {t('nav.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-x-auto overflow-y-auto px-3 py-4 md:px-4 md:py-5 lg:px-5 lg:py-6">
          <div key={pathname} className="animate-route-content mx-auto w-full max-w-full pb-6 md:pb-8">
            {showDemoBanner ? <DemoModeBanner writable={sandboxWritable} /> : null}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

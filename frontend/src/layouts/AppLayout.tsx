import {
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cog,
  Factory,
  GitBranch,
  House,
  Info,
  Library,
  Leaf,
  LogOut,
  MoreHorizontal,
  Package,
  PackageOpen,
  ScrollText,
  ShoppingCart,
  Tag,
  Truck,
  Upload,
  User,
  Bell,
  Warehouse,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { DemoModeChip } from '@/components/DemoModeChip';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useAuth } from '@/AuthContext';
import { useDemoInfo } from '@/api/demoInfo';
import { BrandMark } from '@/components/brand/BrandMark';
import { appBranding, brandMarkParts } from '@/lib/branding';
import { isAdmin, isReadOnlySession } from '@/lib/roles';
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

type NavIcon = typeof House;

type NavItem = {
  to: string;
  label: string;
  icon: NavIcon;
  end?: boolean;
  emphasize?: boolean;
};

type NavGroup = { id: string; label: string; items: NavItem[]; emphasize?: boolean };

const RAIL_COLLAPSED = 68;
const RAIL_EXPANDED = 220;

function getNavGroups(t: (key: string) => string): NavGroup[] {
  return [
    {
      id: 'operacion',
      label: t('nav.groups.operacion'),
      emphasize: true,
      items: [
        { to: '/', label: t('nav.items.inicio'), icon: House, end: true, emphasize: true },
        { to: '/receptions', label: t('nav.items.recepciones'), icon: PackageOpen, emphasize: true },
        { to: '/processes', label: t('nav.items.procesos'), icon: Cog, emphasize: true },
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

function resolvePageTitle(pathname: string, t: (k: string) => string): string {
  const flat = getNavGroups(t).flatMap((g) => g.items);
  const hit = flat.find((i) =>
    i.end ? pathname === i.to : pathname === i.to || pathname.startsWith(`${i.to}/`),
  );
  if (hit) return hit.label;
  if (pathname.startsWith('/bulk-import')) return t('nav.items.cargaMasiva');
  return t('nav.items.inicio');
}


function RailTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group/tip relative flex w-full justify-center">
      {children}
      <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">
        {label}
      </span>
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
      className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-1.5 py-2 [scrollbar-width:thin]"
      aria-label={t('nav.ariaMain')}
    >
      {groups.map((group, gi) => (
        <div key={group.id} className={cn(gi > 0 && 'mt-2.5 border-t border-white/10 pt-2.5')}>
          {!collapsed ? (
            <p
              className={cn(
                'mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.12em]',
                group.emphasize ? 'text-slate-300' : 'text-slate-500',
              )}
            >
              {group.label}
            </p>
          ) : gi === 1 ? (
            <div className="mx-auto mb-1.5 h-px w-6 bg-white/15" aria-hidden />
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const link = (
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-2.5 rounded-lg px-2 transition-colors duration-150',
                      item.emphasize ? 'py-2.5 text-[13px] font-semibold' : 'py-1.5 text-[12.5px] font-medium',
                      collapsed && 'justify-center px-0',
                      isActive
                        ? 'bg-[hsl(var(--brand-primary-glow))] text-white shadow-sm'
                        : 'text-stone-300 hover:bg-white/8 hover:text-white',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={cn(
                          'shrink-0 stroke-[2]',
                          item.emphasize ? 'h-5 w-5' : 'h-4 w-4',
                          isActive ? 'text-white' : 'text-stone-400 group-hover:text-stone-200',
                        )}
                        aria-hidden
                      />
                      {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    </>
                  )}
                </NavLink>
              );
              return (
                <li key={item.to}>{collapsed ? <RailTooltip label={item.label}>{link}</RailTooltip> : link}</li>
              );
            })}
          </ul>
        </div>
      ))}

      {isAdminRole ? (
        <div className="mt-2.5 border-t border-white/10 pt-2.5">
          {!collapsed ? (
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              {t('nav.groups.admin')}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            <li>
              {(() => {
                const link = (
                  <NavLink
                    to="/bulk-import"
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12.5px] font-medium transition-colors',
                        collapsed && 'justify-center px-0',
                        isActive ? 'bg-[hsl(var(--brand-primary-glow))] text-white shadow-sm' : 'text-slate-300 hover:bg-white/8',
                      )
                    }
                  >
                    <Upload className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                    {!collapsed ? <span>{t('nav.items.cargaMasiva')}</span> : null}
                  </NavLink>
                );
                return collapsed ? (
                  <RailTooltip label={t('nav.items.cargaMasiva')}>{link}</RailTooltip>
                ) : (
                  link
                );
              })()}
            </li>
          </ul>
        </div>
      ) : null}

      {isAdminRole ? (
        <div className="mt-auto border-t border-white/10 pt-2">
          <a
            href="/api/docs"
            target="_blank"
            rel="noreferrer"
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-slate-400 hover:bg-white/8 hover:text-slate-200',
              collapsed && 'justify-center px-0',
            )}
            title={collapsed ? t('nav.items.apiDocs') : undefined}
          >
            <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
            {!collapsed ? t('nav.items.apiDocs') : null}
          </a>
        </div>
      ) : (
        <div className="mt-auto" />
      )}
    </nav>
  );
}

const BOTTOM_PRIMARY = [
  { to: '/', end: true as const, icon: House, labelKey: 'nav.bottom.home' },
  { to: '/receptions', icon: PackageOpen, labelKey: 'nav.bottom.receive' },
  { to: '/processes', icon: Cog, labelKey: 'nav.bottom.process' },
  { to: '/existencias-pt', icon: Warehouse, labelKey: 'nav.bottom.stock' },
  { to: '/dispatches', icon: Truck, labelKey: 'nav.bottom.dispatch' },
];

export function AppLayout() {
  const { t } = useTranslation('common');
  const navGroups = useMemo(() => getNavGroups(t), [t]);
  const { username, role, logout } = useAuth();
  const isAdminRole = isAdmin(role);
  const readOnlySession = isReadOnlySession(role);
  const { data: demoInfo } = useDemoInfo(Boolean(username));
  const sandboxWritable = Boolean(demoInfo?.sandbox && demoInfo?.writable);
  // Mockup: el chip DEMO es parte del chrome (visible si el backend reporta demo habilitado).
  const showDemoChip = Boolean(demoInfo?.enabled) || readOnlySession || sandboxWritable;
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const pageTitle = resolvePageTitle(pathname, t);
  useEffect(() => {
    setDrawerOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.title = `${brandMarkParts().company} · ${brandMarkParts().product}`;
  }, []);

  const moreItems = useMemo(() => {
    const primary = new Set(BOTTOM_PRIMARY.map((i) => i.to));
    const items: NavItem[] = navGroups.flatMap((g) => g.items).filter((i) => !primary.has(i.to));
    if (isAdminRole) {
      items.push({
        to: '/bulk-import',
        label: t('nav.items.cargaMasiva'),
        icon: Upload,
      });
    }
    return items;
  }, [navGroups, isAdminRole, t]);

  return (
    <div className="flex min-h-[100dvh] min-w-0 flex-1 bg-[hsl(var(--brand-surface))]">
      <aside
        className="sticky top-0 z-30 hidden h-[100dvh] max-h-[100dvh] shrink-0 flex-col border-r border-[hsl(var(--brand-rail-border))] bg-[hsl(var(--brand-rail))] text-stone-100 transition-[width] duration-200 lg:flex"
        style={{ width: collapsed ? RAIL_COLLAPSED : RAIL_EXPANDED }}
      >
        <div
          className={cn(
            'flex h-12 shrink-0 items-center border-b border-white/10',
            collapsed ? 'justify-center px-1' : 'justify-between gap-1 px-2.5',
          )}
        >
          <BrandMark collapsed={collapsed} />
          {!collapsed ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 shrink-0 p-0 text-slate-300 hover:bg-white/10 hover:text-white"
              onClick={() => setCollapsed(true)}
              aria-label={t('nav.collapseSidebar')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        {collapsed ? (
          <div className="flex justify-center border-b border-white/10 py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-slate-300 hover:bg-white/10 hover:text-white"
              onClick={() => setCollapsed(false)}
              aria-label={t('nav.expandSidebar')}
              title={t('nav.expandSidebar')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
        <NavList groups={navGroups} collapsed={collapsed} isAdminRole={isAdminRole} t={t} />
        <div className={cn('mt-auto border-t border-white/10 px-3 py-3', collapsed && 'px-2')}>
          <div className={cn('flex items-start gap-2', collapsed && 'justify-center')}>
            <Leaf className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--brand-primary-glow))]" aria-hidden />
            {!collapsed ? (
              <p className="font-display text-[10px] leading-snug tracking-[0.04em] text-white/55">
                {appBranding.slogan}
              </p>
            ) : null}
          </div>
        </div>
      </aside>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/45"
            aria-label={t('nav.closeMenu')}
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(100%,280px)] flex-col bg-[hsl(var(--brand-rail))] text-stone-100 shadow-xl">
            <div className="flex h-12 items-center justify-between border-b border-white/10 px-3">
              <BrandMark />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-slate-300 hover:bg-white/10"
                onClick={() => setDrawerOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <NavList
              groups={navGroups}
              collapsed={false}
              isAdminRole={isAdminRole}
              t={t}
              onNavigate={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      {moreOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/45"
            aria-label={t('nav.closeMenu')}
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[75dvh] overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">{t('nav.moreTitle')}</p>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setMoreOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {moreItems.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={() => setMoreOpen(false)}
                      className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[hsl(var(--brand-border))] bg-[hsl(var(--brand-surface-elevated))]/95 px-3 backdrop-blur sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden h-8 w-8 p-0 md:inline-flex lg:hidden"
              onClick={() => setDrawerOpen(true)}
              aria-label={t('nav.openMenu')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="inline-flex h-7 w-7 shrink-0 overflow-hidden rounded-md md:hidden">
              <BrandMark collapsed className="pointer-events-none [&_span]:!h-7 [&_span]:!w-7 [&_img]:!h-7 [&_img]:!w-7" />
            </span>
            <p className="hidden min-w-0 truncate text-[13px] text-[hsl(var(--brand-muted))] lg:block">
              <Leaf className="mr-1.5 inline h-3.5 w-3.5 text-[hsl(var(--brand-primary))]" aria-hidden />
              {appBranding.tagline}
            </p>
            <h1 className="truncate font-display text-[16px] font-semibold tracking-tight text-[hsl(var(--brand-charcoal))] lg:hidden">
              {pageTitle}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {showDemoChip ? <DemoModeChip writable={sandboxWritable} /> : null}
            <button
              type="button"
              className="relative hidden h-8 w-8 items-center justify-center rounded-full text-[hsl(var(--brand-muted))] hover:bg-stone-100 hover:text-[hsl(var(--brand-charcoal))] sm:inline-flex"
              aria-label={t('nav.notifications', { defaultValue: 'Notificaciones' })}
            >
              <Bell className="h-4 w-4" aria-hidden />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
            </button>
            <div className="hidden sm:block">
              <LanguageToggle />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 rounded-full px-1.5 text-slate-600 hover:bg-stone-100 hover:text-slate-900 sm:rounded-md sm:px-2"
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--brand-primary-soft))] text-[hsl(var(--brand-primary))]">
                    <User className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="hidden min-w-0 flex-col items-start leading-tight sm:flex">
                    <span className="max-w-[110px] truncate text-[12px] font-semibold text-[hsl(var(--brand-charcoal))]">
                      {username}
                    </span>
                    <span className="max-w-[110px] truncate text-[10px] capitalize text-[hsl(var(--brand-muted))]">
                      {role}
                    </span>
                  </span>
                  <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 opacity-50 sm:inline" />
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
                <div className="px-2 py-1.5 sm:hidden">
                  <LanguageToggle />
                </div>
                <DropdownMenuSeparator className="sm:hidden" />
                <DropdownMenuItem onClick={() => logout()} className="gap-2 text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4" />
                  {t('nav.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-x-auto overflow-y-auto px-3 py-3 pb-[calc(4.25rem+env(safe-area-inset-bottom))] sm:px-4 sm:py-4 md:pb-5 lg:px-5 lg:py-4">
          <div key={pathname} className="animate-route-content mx-auto w-full max-w-full">
            <Outlet />
          </div>
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
          aria-label={t('nav.bottomAria')}
        >
          {BOTTOM_PRIMARY.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={'end' in item ? item.end : false}
                className={({ isActive }) =>
                  cn(
                    'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-semibold leading-none',
                    isActive ? 'text-[hsl(var(--brand-primary))]' : 'text-stone-500',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={cn('h-5 w-5', isActive ? 'text-[hsl(var(--brand-primary))]' : 'text-stone-400')}
                      strokeWidth={2.25}
                      aria-hidden
                    />
                    <span className="max-w-full truncate">{t(item.labelKey)}</span>
                  </>
                )}
              </NavLink>
            );
          })}
          <button
            type="button"
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-semibold leading-none',
              moreOpen ? 'text-[hsl(var(--brand-primary))]' : 'text-stone-500',
            )}
            onClick={() => setMoreOpen(true)}
            aria-label={t('nav.moreTitle')}
          >
            <MoreHorizontal
              className={cn('h-5 w-5', moreOpen ? 'text-[hsl(var(--brand-primary))]' : 'text-stone-400')}
              strokeWidth={2.25}
              aria-hidden
            />
            <span>{t('nav.moreShort')}</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

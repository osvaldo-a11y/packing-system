import { Link } from 'react-router-dom';
import { ArrowLeft, GitBranch } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  APP_NAV_GROUPS,
  CIERRE_EXPORTS_GUIDE,
  CIERRE_WORKFLOW_STEPS,
  DOCUMENTOS_EXPORTS_GUIDE,
  REPORT_GLOSSARY,
  REPORTING_TABS_GUIDE,
  ROLES_SUMMARY,
  SYSTEM_FLOW_STAGES,
  TRACEABILITY_RESOLUTION_RULES,
  VALIDATION_SCENARIOS,
} from '@/content/reportingHelp';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  contentCard,
  pageHeaderRow,
  pageStack,
  pageSubtitle,
  pageTitle,
  sectionHeadingLg,
  sectionTitle,
} from '@/lib/page-ui';
import { cn } from '@/lib/utils';

export function SystemFlowGuidePage() {
  const { t, i18n } = useTranslation('common');
  const sg = (k: string) => t(`systemGuide.${k}`);
  const lang = i18n.language.startsWith('en') ? 'en' : 'es';

  const navGroups    = APP_NAV_GROUPS(lang);
  const tabsGuide    = REPORTING_TABS_GUIDE(lang);
  const workflowSteps = CIERRE_WORKFLOW_STEPS(lang);
  const cierreExports = CIERRE_EXPORTS_GUIDE(lang);
  const docExports   = DOCUMENTOS_EXPORTS_GUIDE(lang);
  const traceRules   = TRACEABILITY_RESOLUTION_RULES(lang);
  const flowStages   = SYSTEM_FLOW_STAGES(lang);
  const roles        = ROLES_SUMMARY(lang);
  const glossary     = REPORT_GLOSSARY(lang);
  const scenarios    = VALIDATION_SCENARIOS(lang);

  return (
    <div className={pageStack}>
      <div className={pageHeaderRow}>
        <div className="min-w-0 space-y-3">
          <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 px-0 text-[13px] font-medium text-slate-500 hover:text-slate-900">
            <Link to="/reporting">
              <ArrowLeft className="h-4 w-4" />
              {sg('backToReports')}
            </Link>
          </Button>
          <div>
            <h1 className={pageTitle}>{sg('title')}</h1>
            <p className={cn(pageSubtitle, 'mt-1.5 max-w-3xl')}>{sg('subtitle')}</p>
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 gap-1 border-slate-200 bg-white text-[11px] font-medium text-slate-600">
          <GitBranch className="h-3 w-3" aria-hidden />
          {sg('badgeDoc')}
        </Badge>
      </div>

      <Card className={cn(contentCard, 'border-primary/20 bg-primary/[0.04]')}>
        <CardHeader>
          <CardTitle className={sectionTitle}>{sg('howToUseTitle')}</CardTitle>
          <CardDescription className="text-[13px] leading-relaxed text-slate-600">
            {sg('howToUseDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0 text-[13px]">
          <Link to="/reporting" className="font-medium text-primary underline-offset-4 hover:underline">
            {sg('linkReports')}
          </Link>
          <span className="text-slate-300">·</span>
          <Link to="/dispatches" className="font-medium text-primary underline-offset-4 hover:underline">
            {sg('linkDispatches')}
          </Link>
          <span className="text-slate-300">·</span>
          <Link to="/pt-tags" className="font-medium text-primary underline-offset-4 hover:underline">
            {sg('linkPtUnit')}
          </Link>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className={sectionHeadingLg}>{sg('sectionModules')}</h2>
        <p className="text-[13px] text-slate-500">{sg('sectionModulesDesc')}</p>
        <div className="space-y-4">
          {navGroups.map((group) => (
            <Card key={group.id} className={contentCard}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">{group.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {group.items.map((item) => (
                  <div key={item.path} className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Link to={item.path} className="text-sm font-semibold text-slate-900 hover:text-primary">
                        {item.label}
                      </Link>
                      <span className="font-mono text-[11px] text-slate-400">{item.path}</span>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{item.purpose}</p>
                    {item.notes ? <p className="mt-1 text-xs text-slate-500">{item.notes}</p> : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className={sectionHeadingLg}>{sg('sectionTabs')}</h2>
        <p className="text-[13px] text-slate-500">
          <strong className="text-slate-700">{sg('sectionTabsImportant')}</strong>{' '}
          {sg('sectionTabsNote')}{' '}
          <span className="font-mono">fecha_desde → fecha_hasta</span>{' '}
          {sg('sectionTabsNoteEnd')}
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {tabsGuide.map((tab) => (
            <Card key={tab.id} className={cn(contentCard, tab.id === 'cierre' && 'border-blue-200/80 bg-blue-50/30')}>
              <CardHeader className="pb-2">
                <CardTitle className={sectionTitle}>{tab.label}</CardTitle>
                <CardDescription className="text-[13px] font-medium text-slate-700">{tab.answers}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-600">
                <p>
                  <span className="font-medium text-slate-800">{sg('tabDateBasis')}</span> {tab.dateBasis}
                </p>
                <ul className="list-inside list-disc space-y-1">
                  {tab.sections.map((s) => <li key={s}>{s}</li>)}
                </ul>
                {tab.exports ? (
                  <p className="text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{sg('tabExports')}</span> {tab.exports}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className={sectionHeadingLg}>{sg('sectionCierre')}</h2>
        <Card className={contentCard}>
          <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-3">
            {workflowSteps.map((s) => (
              <div key={s.step} className="rounded-lg border border-slate-100 bg-white px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{sg('stepPrefix')} {s.step}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{s.title}</p>
                <p className="mt-1 text-[13px] leading-snug text-slate-600">{s.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className={cn(contentCard, 'border-dashed')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-800">{sg('sectionCierreViews')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-slate-600 md:grid-cols-2">
            <p><span className="font-medium text-slate-800">{sg('viewGlobal')}</span> {lang === 'en'
              ? 'Final settlement (KPIs and expandable table with dispatch/format detail, date and BOL), Exports block (Excel/CSV/PDF for all), collapsible analysis by client, format and dispatch; admin diagnostic.'
              : 'Liquidación final (KPIs y tabla expandible con detalle por despacho/formato, fecha y BOL), bloque Exportaciones (Excel/CSV/PDF de todos), análisis colapsables por cliente, formato y despacho; diagnóstico admin.'
            }</p>
            <p><span className="font-medium text-slate-800">{sg('viewProducer')}</span> {lang === 'en'
              ? 'Selector, export-ready indicator, producer PDF, executive PDF, producer Excel (paginated), filtered settlement and "View in global" link.'
              : 'Selector, indicador de listo para exportar, PDF productor, PDF ejecutivo, Excel productor (paginado), liquidación filtrada y enlace «Ver en global».'
            }</p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className={sectionHeadingLg}>{sg('sectionExports')}</h2>
        <p className="text-[13px] text-slate-500">
          {sg('sectionExportsDesc1')} <strong className="text-slate-700">{sg('sectionExportsDesc2')}</strong>{' '}
          {sg('sectionExportsDesc3')} <strong className="text-slate-700">{sg('sectionExportsDesc4')}</strong>{' '}
          {sg('sectionExportsDesc5')} <span className="font-mono">lang=es|en</span>{' '}
          {sg('sectionExportsDesc6')}
        </p>
        <Card className={contentCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-800">{sg('tableCierre')}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto pt-0">
            <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">{sg('colWhere')}</th>
                  <th className="py-2 pr-3">{sg('colButton')}</th>
                  <th className="py-2 pr-3">{sg('colFormat')}</th>
                  <th className="py-2">{sg('colScope')}</th>
                </tr>
              </thead>
              <tbody>
                {cierreExports.map((row) => (
                  <tr key={`${row.location}-${row.label}`} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3 text-slate-600">{row.location}</td>
                    <td className="py-2 pr-3 font-medium text-slate-900">{row.label}</td>
                    <td className="py-2 pr-3 text-slate-600">{row.format}</td>
                    <td className="py-2 text-slate-600">{row.scope}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card className={contentCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-800">{sg('tableDocumentos')}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto pt-0">
            <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">{sg('colWhere')}</th>
                  <th className="py-2 pr-3">{sg('colButton')}</th>
                  <th className="py-2 pr-3">{sg('colFormat')}</th>
                  <th className="py-2">{sg('colScope')}</th>
                </tr>
              </thead>
              <tbody>
                {docExports.map((row) => (
                  <tr key={`${row.location}-${row.label}`} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3 text-slate-600">{row.location}</td>
                    <td className="py-2 pr-3 font-medium text-slate-900">{row.label}</td>
                    <td className="py-2 pr-3 text-slate-600">{row.format}</td>
                    <td className="py-2 text-slate-600">{row.scope}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <details className="rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
          <summary className="cursor-pointer font-medium text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
            {sg('tableTechnical')}
          </summary>
          <ul className="mt-3 list-inside list-disc space-y-2 text-xs leading-relaxed">
            {[...cierreExports, ...docExports]
              .filter((r) => r.technical)
              .map((r) => (
                <li key={`${r.label}-tech`}>
                  <span className="font-medium text-slate-800">{r.label}:</span> {r.technical}
                </li>
              ))}
          </ul>
        </details>
      </section>

      <section className="space-y-4">
        <h2 className={sectionHeadingLg}>{sg('sectionTraceability')}</h2>
        <p className="text-[13px] text-slate-500">{sg('sectionTraceabilityDesc')}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {traceRules.map((r) => (
            <Card key={r.code} className={cn(contentCard, 'border-slate-100')}>
              <CardContent className="py-3">
                <p className="font-mono text-xs font-medium text-slate-800">{r.code}</p>
                <p className="mt-1 text-[13px] text-slate-600">{r.when}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className={sectionHeadingLg}>{sg('sectionFlow')}</h2>
        <div className="space-y-4">
          {flowStages.map((stage) => (
            <Card key={stage.title} className={contentCard}>
              <CardHeader className="pb-2">
                <CardTitle className={sectionTitle}>{stage.title}</CardTitle>
                <CardDescription className="text-[13px] leading-relaxed text-slate-600">{stage.summary}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm md:grid-cols-3">
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{sg('flowBorn')}</p>
                  <ul className="list-inside list-disc space-y-1 text-slate-600">
                    {stage.born.map((x) => <li key={x}>{x}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{sg('flowCarries')}</p>
                  <ul className="list-inside list-disc space-y-1 text-slate-600">
                    {stage.carries.map((x) => <li key={x}>{x}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{sg('flowReports')}</p>
                  <ul className="list-inside list-disc space-y-1 text-slate-600">
                    {stage.reports.map((x) => <li key={x}>{x}</li>)}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className={sectionHeadingLg}>{sg('sectionRoles')}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {roles.map((r) => (
            <Card key={r.role} className={contentCard}>
              <CardHeader className="pb-2">
                <CardTitle className="font-mono text-sm capitalize text-slate-900">{r.role}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="list-inside list-disc space-y-1 text-[13px] text-slate-600">
                  {r.canDo.map((x) => <li key={x}>{x}</li>)}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className={sectionHeadingLg}>{sg('sectionGlossary')}</h2>
        <p className="text-[13px] text-slate-500">
          {sg('sectionGlossaryNote')}{' '}
          <Link to="/reporting" className="font-medium text-primary underline-offset-4 hover:underline">
            {sg('sectionGlossaryNoteMid')}
          </Link>{' '}
          {sg('sectionGlossaryNoteEnd')}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {glossary.map((g) => (
            <Card key={g.id} className={cn(contentCard, 'border-slate-100')}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-900">{g.name}</CardTitle>
                <p className="text-xs text-slate-500">{g.meaning}</p>
              </CardHeader>
              <CardContent className="space-y-1 pt-0 text-xs text-slate-600">
                <p><span className="font-medium text-slate-800">{sg('glossarySource')}</span> {g.source}</p>
                <p><span className="font-medium text-slate-800">{sg('glossaryIncludes')}</span> {g.includes}</p>
                <p><span className="font-medium text-slate-800">{sg('glossaryExcludes')}</span> {g.excludes}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className={sectionHeadingLg}>{sg('sectionScenarios')}</h2>
        <div className="space-y-4">
          {scenarios.map((s) => (
            <Card key={s.id} className={cn(contentCard, 'border-dashed border-slate-200/90 bg-slate-50/40')}>
              <CardHeader className="pb-2">
                <CardTitle className={sectionTitle}>
                  {sg('scenarioPrefix')} {s.id}: {s.title}
                </CardTitle>
                <CardDescription className="text-[13px] text-slate-600">{s.setup}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                <p><span className="font-medium text-slate-800">{sg('scenarioDispatches')}</span> {s.expectDispatches}</p>
                <p><span className="font-medium text-slate-800">{sg('scenarioInvoices')}</span> {s.expectInvoices}</p>
                <p><span className="font-medium text-slate-800">{sg('scenarioFormatCost')}</span> {s.expectFormatCost}</p>
                <p><span className="font-medium text-slate-800">{sg('scenarioLiquidacion')}</span> {s.expectLiquidacion}</p>
                <p className="md:col-span-2"><span className="font-medium text-slate-800">{sg('scenarioMargen')}</span> {s.expectMargen}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

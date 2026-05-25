import { Link } from 'react-router-dom';
import { ArrowLeft, GitBranch } from 'lucide-react';
import {
  APP_NAV_GROUPS,
  CIERRE_WORKFLOW_STEPS,
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
  return (
    <div className={pageStack}>
      <div className={pageHeaderRow}>
        <div className="min-w-0 space-y-3">
          <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 px-0 text-[13px] font-medium text-slate-500 hover:text-slate-900">
            <Link to="/reporting">
              <ArrowLeft className="h-4 w-4" />
              Volver a Reportes
            </Link>
          </Button>
          <div>
            <h1 className={pageTitle}>Guía del sistema</h1>
            <p className={cn(pageSubtitle, 'mt-1.5 max-w-3xl')}>
              Documentación actualizada del flujo de datos, módulos de la aplicación y pestañas de Reportes. Sirve para
              capacitar usuarios y validar números sin mezclar operación diaria, comercial y cierre financiero del período.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 gap-1 border-slate-200 bg-white text-[11px] font-medium text-slate-600">
          <GitBranch className="h-3 w-3" aria-hidden />
          Solo documentación — no cambia cálculos
        </Badge>
      </div>

      <Card className={cn(contentCard, 'border-primary/20 bg-primary/[0.04]')}>
        <CardHeader>
          <CardTitle className={sectionTitle}>Cómo usar esta guía</CardTitle>
          <CardDescription className="text-[13px] leading-relaxed text-slate-600">
            <strong className="text-slate-800">Tres niveles de lectura:</strong> (1) módulos del menú — dónde se cargan
            los datos; (2) pestañas de Reportes — qué pregunta responde cada una; (3) flujo por etapa — qué nace en cada
            paso y qué informes lo consumen. En pantalla, cada bloque de reporte muestra su «fuente de verdad». El
            diagnóstico JSON de liquidación y la carga masiva CSV son solo para administradores.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0 text-[13px]">
          <Link to="/reporting" className="font-medium text-primary underline-offset-4 hover:underline">
            Ir a Reportes
          </Link>
          <span className="text-slate-300">·</span>
          <Link to="/dispatches" className="font-medium text-primary underline-offset-4 hover:underline">
            Despachos
          </Link>
          <span className="text-slate-300">·</span>
          <Link to="/pt-tags" className="font-medium text-primary underline-offset-4 hover:underline">
            Unidad PT
          </Link>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className={sectionHeadingLg}>Módulos de la aplicación</h2>
        <p className="text-[13px] text-slate-500">
          Rutas del menú lateral. Los datos cargados aquí alimentan Reportes cuando generás o actualizás el cierre del
          período.
        </p>
        <div className="space-y-4">
          {APP_NAV_GROUPS.map((group) => (
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
        <h2 className={sectionHeadingLg}>Reportes — las cuatro pestañas</h2>
        <p className="text-[13px] text-slate-500">
          <strong className="text-slate-700">Importante:</strong> Operación y Decisión usan la fecha operativa del día;
          Cierre y Documentos usan el período <span className="font-mono">fecha_desde → fecha_hasta</span> y los filtros
          del panel de liquidación.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {REPORTING_TABS_GUIDE.map((tab) => (
            <Card key={tab.id} className={cn(contentCard, tab.id === 'cierre' && 'border-blue-200/80 bg-blue-50/30')}>
              <CardHeader className="pb-2">
                <CardTitle className={sectionTitle}>{tab.label}</CardTitle>
                <CardDescription className="text-[13px] font-medium text-slate-700">{tab.answers}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-600">
                <p>
                  <span className="font-medium text-slate-800">Base de fechas:</span> {tab.dateBasis}
                </p>
                <ul className="list-inside list-disc space-y-1">
                  {tab.sections.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
                {tab.exports ? (
                  <p className="text-xs text-slate-500">
                    <span className="font-medium text-slate-700">Exportar:</span> {tab.exports}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className={sectionHeadingLg}>Cierre del período — pasos recomendados</h2>
        <Card className={contentCard}>
          <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-3">
            {CIERRE_WORKFLOW_STEPS.map((s) => (
              <div key={s.step} className="rounded-lg border border-slate-100 bg-white px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Paso {s.step}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{s.title}</p>
                <p className="mt-1 text-[13px] leading-snug text-slate-600">{s.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className={cn(contentCard, 'border-dashed')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-800">Vistas dentro de Cierre</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-slate-600 md:grid-cols-2">
            <p>
              <span className="font-medium text-slate-800">Liquidación global:</span> totales, tabla por productor
              expandible, bloque de exportaciones, análisis por cliente, formato y despacho, diagnóstico admin.
            </p>
            <p>
              <span className="font-medium text-slate-800">Por productor:</span> selector de productor, PDF/Excel del
              informe y liquidación filtrada a ese productor; enlace para ver el mismo productor en la vista global.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className={sectionHeadingLg}>Trazabilidad en liquidación</h2>
        <p className="text-[13px] text-slate-500">
          Cómo el sistema asigna cada línea de factura a un productor (o a «sin asignar»). Coincide con el panel de
          diagnóstico en Cierre (admin).
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {TRACEABILITY_RESOLUTION_RULES.map((r) => (
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
        <h2 className={sectionHeadingLg}>Flujo por etapa (cadena de valor)</h2>
        <div className="space-y-4">
          {SYSTEM_FLOW_STAGES.map((stage) => (
            <Card key={stage.title} className={contentCard}>
              <CardHeader className="pb-2">
                <CardTitle className={sectionTitle}>{stage.title}</CardTitle>
                <CardDescription className="text-[13px] leading-relaxed text-slate-600">{stage.summary}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm md:grid-cols-3">
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Qué nace aquí</p>
                  <ul className="list-inside list-disc space-y-1 text-slate-600">
                    {stage.born.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Qué se arrastra</p>
                  <ul className="list-inside list-disc space-y-1 text-slate-600">
                    {stage.carries.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Reportes / uso</p>
                  <ul className="list-inside list-disc space-y-1 text-slate-600">
                    {stage.reports.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className={sectionHeadingLg}>Roles y permisos (resumen)</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {ROLES_SUMMARY.map((r) => (
            <Card key={r.role} className={contentCard}>
              <CardHeader className="pb-2">
                <CardTitle className="font-mono text-sm capitalize text-slate-900">{r.role}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="list-inside list-disc space-y-1 text-[13px] text-slate-600">
                  {r.canDo.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className={sectionHeadingLg}>Glosario de reportes</h2>
        <p className="text-[13px] text-slate-500">
          Detalle también en{' '}
          <Link to="/reporting" className="font-medium text-primary underline-offset-4 hover:underline">
            Reportes → Ayuda
          </Link>{' '}
          (panel colapsable).
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {REPORT_GLOSSARY.map((g) => (
            <Card key={g.id} className={cn(contentCard, 'border-slate-100')}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-900">{g.name}</CardTitle>
                <p className="text-xs text-slate-500">{g.meaning}</p>
              </CardHeader>
              <CardContent className="space-y-1 pt-0 text-xs text-slate-600">
                <p>
                  <span className="font-medium text-slate-800">Fuente:</span> {g.source}
                </p>
                <p>
                  <span className="font-medium text-slate-800">Incluye:</span> {g.includes}
                </p>
                <p>
                  <span className="font-medium text-slate-800">No incluye:</span> {g.excludes}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className={sectionHeadingLg}>Escenarios de validación</h2>
        <div className="space-y-4">
          {VALIDATION_SCENARIOS.map((s) => (
            <Card key={s.id} className={cn(contentCard, 'border-dashed border-slate-200/90 bg-slate-50/40')}>
              <CardHeader className="pb-2">
                <CardTitle className={sectionTitle}>
                  Escenario {s.id}: {s.title}
                </CardTitle>
                <CardDescription className="text-[13px] text-slate-600">{s.setup}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                <p>
                  <span className="font-medium text-slate-800">Despachos:</span> {s.expectDispatches}
                </p>
                <p>
                  <span className="font-medium text-slate-800">Facturas:</span> {s.expectInvoices}
                </p>
                <p>
                  <span className="font-medium text-slate-800">Costo por formato:</span> {s.expectFormatCost}
                </p>
                <p>
                  <span className="font-medium text-slate-800">Liquidación:</span> {s.expectLiquidacion}
                </p>
                <p className="md:col-span-2">
                  <span className="font-medium text-slate-800">Margen / operación:</span> {s.expectMargen}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

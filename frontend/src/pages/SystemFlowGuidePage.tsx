import { Link } from 'react-router-dom';
import { ArrowLeft, GitBranch } from 'lucide-react';
import { REPORT_GLOSSARY, SYSTEM_FLOW_STAGES, VALIDATION_SCENARIOS } from '@/content/reportingHelp';
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
              Mapa de datos desde la recepción hasta liquidación y márgenes. Sirve para capacitar usuarios y validar números
              sin mezclar niveles operativo, logístico-comercial y financiero.
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
            Cada etapa indica <strong className="text-slate-800">qué dato nace</strong> ahí,{' '}
            <strong className="text-slate-800">qué se arrastra</strong> a etapas posteriores y{' '}
            <strong className="text-slate-800">qué reportes</strong> dependen de esa base. En Reportes, cada informe indica su “fuente de verdad” en
            pantalla. El diagnóstico técnico de liquidación sigue restringido a administradores.
          </CardDescription>
        </CardHeader>
      </Card>

      <section className="space-y-4">
        <h2 className={sectionHeadingLg}>Flujo por etapa</h2>
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
        <h2 className={sectionHeadingLg}>Glosario de reportes (resumen)</h2>
        <p className="text-[13px] text-slate-500">
          El detalle completo está también en{' '}
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
                  <span className="font-medium text-slate-800">Margen por cliente:</span> {s.expectMargen}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

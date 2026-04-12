import { Link } from 'react-router-dom';
import { GitBranch } from 'lucide-react';
import { REPORT_GLOSSARY, VALIDATION_SCENARIOS } from '@/content/reportingHelp';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { contentCard } from '@/lib/page-ui';
import { cn } from '@/lib/utils';

/**
 * Ayuda colapsable en la pantalla Reportes: glosario, escenarios y enlace a la guía del sistema.
 */
export function ReportingHelpPanel() {
  return (
    <details className="group rounded-2xl border border-slate-100 bg-white/95 shadow-sm open:border-slate-200/90">
      <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-medium text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="mr-2 inline-block transition-transform group-open:rotate-90">▸</span>
        <GitBranch className="mr-2 inline h-4 w-4 text-primary" />
        Ayuda y glosario de reportes
        <span className="ml-2 font-normal text-slate-500">(opcional)</span>
      </summary>
      <div className="space-y-4 border-t border-slate-100 bg-slate-50/40 px-4 pb-4 pt-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-slate-600">
            Para el flujo completo recepción → liquidación, abrí la guía dedicada (misma información que validarías con
            datos reales o siembra).
          </p>
          <Button asChild variant="secondary" size="sm" className="gap-1.5">
            <Link to="/guide/sistema">
              <GitBranch className="h-3.5 w-3.5" />
              Guía del sistema (flujo completo)
            </Link>
          </Button>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Glosario</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {REPORT_GLOSSARY.map((g) => (
              <Card key={g.id} className={cn(contentCard, 'border-slate-100')}>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm leading-snug">{g.name}</CardTitle>
                  <Badge variant="outline" className="w-fit font-mono text-[10px] font-normal">
                    Fuente: {g.source}
                  </Badge>
                  <CardDescription className="text-xs leading-relaxed">{g.meaning}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1.5 pt-0 text-xs text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">Incluye:</span> {g.includes}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">No incluye:</span> {g.excludes}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Escenarios de validación</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Usá los mismos filtros de fechas en Reportes y contrastá con Despachos / datos cargados. Ajustá a tu siembra
            actual.
          </p>
          <div className="space-y-4">
            {VALIDATION_SCENARIOS.map((s) => (
              <Card key={s.id} className={cn(contentCard, 'border-dashed border-slate-200/90 bg-slate-50/40')}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Escenario {s.id}: {s.title}
                  </CardTitle>
                  <CardDescription className="text-xs leading-relaxed">{s.setup}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                  <p>
                    <span className="font-medium text-foreground">Despachos:</span> {s.expectDispatches}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Facturas / líneas:</span> {s.expectInvoices}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Costo por formato:</span> {s.expectFormatCost}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Liquidación:</span> {s.expectLiquidacion}
                  </p>
                  <p className="md:col-span-2">
                    <span className="font-medium text-foreground">Margen por cliente:</span> {s.expectMargen}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}

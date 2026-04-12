import { Activity, BookOpen, ExternalLink, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { contentCard, pageStack, pageSubtitle, pageTitle, sectionTitle } from '@/lib/page-ui';
import { cn } from '@/lib/utils';

const WEB_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';

export function AboutPage() {
  return (
    <div className={cn(pageStack, 'mx-auto max-w-2xl')}>
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-slate-100/90 p-2.5 text-primary">
          <Info className="h-6 w-6" aria-hidden />
        </div>
        <div className="min-w-0 space-y-1.5">
          <h1 className={pageTitle}>Acerca del sistema</h1>
          <p className={pageSubtitle}>Pinebloom Packing — panel operativo para planta, empaque, proceso, despacho y reportes.</p>
        </div>
      </div>

      <Card className={contentCard}>
        <CardHeader>
          <CardTitle className={sectionTitle}>Versión</CardTitle>
          <CardDescription className="text-[13px]">Interfaz web (build Vite)</CardDescription>
        </CardHeader>
        <CardContent className="font-mono text-sm text-slate-700">Web UI v{WEB_VERSION}</CardContent>
      </Card>

      <Card className={contentCard}>
        <CardHeader>
          <CardTitle className={cn(sectionTitle, 'flex items-center gap-2')}>
            <Activity className="h-4 w-4 text-slate-500" aria-hidden />
            Estado y documentación
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-[13px]">
          <a
            href="/api/auth/health"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 font-medium text-primary hover:underline"
          >
            Health check (JSON) <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </a>
          <a
            href="/api/docs"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 font-medium text-primary hover:underline"
          >
            Swagger / OpenAPI <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </a>
        </CardContent>
      </Card>

      <Card className={contentCard}>
        <CardHeader>
          <CardTitle className={cn(sectionTitle, 'flex items-center gap-2')}>
            <BookOpen className="h-4 w-4 text-slate-500" aria-hidden />
            Buenas prácticas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-[13px] leading-relaxed text-slate-600">
          <p>Usá roles adecuados (operador, supervisor, admin) y no compartas credenciales.</p>
          <p>En producción: contraseñas con hash bcrypt, JWT fuerte y HTTPS.</p>
          <p>El login tiene límite de intentos por minuto para reducir abuso.</p>
        </CardContent>
      </Card>

      <p className="text-center text-[13px] text-slate-500">
        <Link to="/" className="font-medium text-primary hover:underline">
          ← Volver al inicio
        </Link>
      </p>
    </div>
  );
}

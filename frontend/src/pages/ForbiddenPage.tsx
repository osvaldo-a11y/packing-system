import { ShieldX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { errorStateCard } from '@/lib/page-ui';
import { cn } from '@/lib/utils';

export function ForbiddenPage() {
  return (
    <div className="flex min-h-[min(100dvh,100%)] w-full flex-1 flex-col items-center justify-center p-4">
      <Card className={cn(errorStateCard, 'max-w-md text-center')}>
        <CardHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100/80 text-rose-700">
            <ShieldX className="h-7 w-7" aria-hidden />
          </div>
          <CardTitle className="text-lg font-semibold text-slate-900">Acceso denegado</CardTitle>
          <CardDescription className="text-[13px] leading-relaxed text-slate-600">
            Tu usuario no tiene permiso para esta acción o ruta. Si creés que es un error, contactá a un administrador.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild className="rounded-xl">
            <Link to="/">Volver al inicio</Link>
          </Button>
          <Button variant="outline" asChild className="rounded-xl border-slate-200">
            <Link to="/about">Acerca del sistema</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

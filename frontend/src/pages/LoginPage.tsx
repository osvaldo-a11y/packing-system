import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiFetch } from '@/api';
import { useAuth } from '@/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { contentCard, pageTitle } from '@/lib/page-ui';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const loginSchema = z.object({
  username: z.string().min(1, 'Usuario requerido'),
  password: z.string().min(1, 'Contraseña requerida'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { token, login } = useAuth();
  const navigate = useNavigate();
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  if (token) return <Navigate to="/" replace />;

  async function onSubmit(values: LoginForm) {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const m = (body as { message?: string | string[] }).message;
      const msg = Array.isArray(m) ? m.join(' ') : m || 'Credenciales inválidas';
      toast.error(msg);
      return;
    }
    const data = (await res.json()) as { access_token: string };
    login(data.access_token);
    toast.success('Sesión iniciada');
    navigate('/', { replace: true });
  }

  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center p-4 sm:p-6">
      <div className="mb-8 text-center">
        <h1 className={pageTitle}>
          Pinebloom <span className="text-primary">Packing</span>
        </h1>
        <p className="mt-1.5 text-[13px] text-slate-500">Acceso al panel de operaciones</p>
      </div>
      <Card className={cn(contentCard, 'w-full max-w-md shadow-lg shadow-slate-200/50')}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900">Iniciar sesión</CardTitle>
          <CardDescription className="text-[13px]">Usuario y contraseña definidos en tu archivo `.env` (`AUTH_USERS_JSON`).</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="username">Usuario</Label>
              <Input id="username" autoComplete="username" {...form.register('username')} />
              {form.formState.errors.username && (
                <p className="text-sm text-destructive">{form.formState.errors.username.message}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" autoComplete="current-password" {...form.register('password')} />
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
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
import { LanguageToggle } from '@/components/LanguageToggle';

/** Credenciales públicas de demostración (solo lectura / rol viewer). */
const DEMO_USERNAME = import.meta.env.VITE_DEMO_USERNAME || 'demo';
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || 'demo123';
const SHOW_DEMO_LOGIN = import.meta.env.VITE_DEMO_LOGIN !== 'false';

export function LoginPage() {
  const { t } = useTranslation('common');
  const [demoSubmitting, setDemoSubmitting] = useState(false);

  const loginSchema = z.object({
    username: z.string().min(1, t('login.errorUsernameRequired')),
    password: z.string().min(1, t('login.errorPasswordRequired')),
  });

  type LoginForm = z.infer<typeof loginSchema>;

  const { token, login } = useAuth();
  const navigate = useNavigate();
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  if (token) return <Navigate to="/" replace />;

  async function signIn(values: LoginForm) {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const m = (body as { message?: string | string[] }).message;
      const msg = Array.isArray(m) ? m.join(' ') : m || t('login.errorInvalidCredentials');
      toast.error(msg);
      return false;
    }
    const data = (await res.json()) as { access_token: string };
    login(data.access_token);
    toast.success(t('login.toastSuccess'));
    navigate('/', { replace: true });
    return true;
  }

  async function onSubmit(values: LoginForm) {
    await signIn(values);
  }

  async function onDemoLogin() {
    setDemoSubmitting(true);
    form.setValue('username', DEMO_USERNAME);
    form.setValue('password', DEMO_PASSWORD);
    try {
      await signIn({ username: DEMO_USERNAME, password: DEMO_PASSWORD });
    } finally {
      setDemoSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center p-4 sm:p-6">
      <div className="absolute right-3 top-3 sm:right-4 sm:top-4">
        <LanguageToggle />
      </div>
      <div className="mb-8 text-center">
        <h1 className={pageTitle}>
          Pinebloom <span className="text-primary">Packing</span>
        </h1>
        <p className="mt-1.5 text-[13px] text-slate-500">{t('login.subtitle')}</p>
      </div>
      <Card className={cn(contentCard, 'w-full max-w-md shadow-lg shadow-slate-200/50')}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900">{t('login.cardTitle')}</CardTitle>
          <CardDescription className="text-[13px]">{t('login.cardDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="username">{t('login.fieldUsername')}</Label>
              <Input id="username" autoComplete="username" {...form.register('username')} />
              {form.formState.errors.username && (
                <p className="text-sm text-destructive">{form.formState.errors.username.message}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">{t('login.fieldPassword')}</Label>
              <Input id="password" type="password" autoComplete="current-password" {...form.register('password')} />
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || demoSubmitting}>
              {form.formState.isSubmitting ? t('login.submitting') : t('login.submit')}
            </Button>
          </form>

          {SHOW_DEMO_LOGIN ? (
            <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/70 px-3 py-3">
              <p className="text-sm font-medium text-emerald-950">{t('login.demoTitle')}</p>
              <p className="mt-1 text-[12px] leading-snug text-emerald-900/85">{t('login.demoDesc')}</p>
              <p className="mt-2 font-mono text-[12px] text-emerald-900/90">
                {t('login.demoCredentials', { user: DEMO_USERNAME, pass: DEMO_PASSWORD })}
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-3 w-full border-emerald-300 bg-white text-emerald-950 hover:bg-emerald-50"
                disabled={form.formState.isSubmitting || demoSubmitting}
                onClick={() => void onDemoLogin()}
              >
                {demoSubmitting ? t('login.submitting') : t('login.demoSubmit')}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

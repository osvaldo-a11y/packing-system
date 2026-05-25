import { Activity, BookOpen, ExternalLink, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { contentCard, pageStack, pageSubtitle, pageTitle, sectionTitle } from '@/lib/page-ui';
import { cn } from '@/lib/utils';

const WEB_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';

export function AboutPage() {
  const { t } = useTranslation('common');

  return (
    <div className={cn(pageStack, 'mx-auto max-w-2xl')}>
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-slate-100/90 p-2.5 text-primary">
          <Info className="h-6 w-6" aria-hidden />
        </div>
        <div className="min-w-0 space-y-1.5">
          <h1 className={pageTitle}>{t('about.pageTitle')}</h1>
          <p className={pageSubtitle}>{t('about.pageSubtitle')}</p>
        </div>
      </div>

      <Card className={contentCard}>
        <CardHeader>
          <CardTitle className={sectionTitle}>{t('about.version.title')}</CardTitle>
          <CardDescription className="text-[13px]">{t('about.version.description')}</CardDescription>
        </CardHeader>
        <CardContent className="font-mono text-sm text-slate-700">
          {t('about.version.value', { version: WEB_VERSION })}
        </CardContent>
      </Card>

      <Card className={contentCard}>
        <CardHeader>
          <CardTitle className={cn(sectionTitle, 'flex items-center gap-2')}>
            <Activity className="h-4 w-4 text-slate-500" aria-hidden />
            {t('about.status.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-[13px]">
          <a
            href="/api/auth/health"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 font-medium text-primary hover:underline"
          >
            {t('about.status.healthCheck')} <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </a>
          <a
            href="/api/docs"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 font-medium text-primary hover:underline"
          >
            {t('about.status.swagger')} <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </a>
        </CardContent>
      </Card>

      <Card className={contentCard}>
        <CardHeader>
          <CardTitle className={cn(sectionTitle, 'flex items-center gap-2')}>
            <BookOpen className="h-4 w-4 text-slate-500" aria-hidden />
            {t('about.practices.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-[13px] leading-relaxed text-slate-600">
          <p>{t('about.practices.tip1')}</p>
          <p>{t('about.practices.tip2')}</p>
          <p>{t('about.practices.tip3')}</p>
        </CardContent>
      </Card>

      <p className="text-center text-[13px] text-slate-500">
        <Link to="/" className="font-medium text-primary hover:underline">
          {t('about.backHome')}
        </Link>
      </p>
    </div>
  );
}

import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ReportHelpId } from '@/content/reportingHelp';
import { getReportGlossaryEntry, REPORT_SOURCE_TRUTH } from '@/content/reportingHelp';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Bloque de claridad semántica: qué mide, fuente, incluye / no incluye (solo UX).
 */
export function ReportSemanticBlock({ helpId }: { helpId: ReportHelpId }) {
  const { t, i18n } = useTranslation('common');
  const lang = i18n.language.startsWith('en') ? 'en' : 'es';
  const g = getReportGlossaryEntry(helpId, lang);
  const shortSource = REPORT_SOURCE_TRUTH[helpId];

  return (
    <Card className="border-slate-200/90 bg-gradient-to-b from-slate-50/90 to-white shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <div>
            <CardTitle className="text-sm font-semibold text-slate-900">{t('reporting.semanticBlock.title')}</CardTitle>
            <p className="mt-1 text-xs text-slate-600">
              <span className="font-medium text-slate-700">{t('reporting.semanticBlock.fuenteTecnica')}</span>{' '}
              <span className="font-mono text-[11px] text-slate-600">{shortSource}</span>
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0 text-sm">
        {g ? (
          <>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('reporting.semanticBlock.queMide')}</p>
              <p className="mt-0.5 leading-snug text-slate-800">{g.meaning}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('reporting.semanticBlock.fuenteVerdad')}</p>
              <p className="mt-0.5 leading-snug text-slate-700">{g.source}</p>
            </div>
            <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{t('reporting.semanticBlock.incluye')}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{g.includes}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('reporting.semanticBlock.noIncluye')}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{g.excludes}</p>
              </div>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{t('reporting.semanticBlock.sinDescripcion')}</p>
        )}
      </CardContent>
    </Card>
  );
}

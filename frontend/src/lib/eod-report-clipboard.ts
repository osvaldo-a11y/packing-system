import { formatCount } from '@/lib/number-format';

export type EodReportLabels = {
  title: string;
  mpLabel: string;
  clientPrefix: string;
  noMovement: string;
  noBoxes: string;
  packed: string;
  camara: string;
  shipped: string;
  pageTitle: string;
  days: string[];
  months: string[];
  dateFormat: string;
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const DIAS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;
const MESES_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

/** Ej. `YYYY-MM-DD` → `Sábado 10 de mayo, 2026` (calendario local). */
export function formatDayKeySpanishLong(
  dayKey: string,
  labels?: Pick<EodReportLabels, 'days' | 'months' | 'dateFormat'>,
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim());
  if (!m) return dayKey.trim();
  const y = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (!Number.isFinite(y) || monthIndex < 0 || monthIndex > 11 || !Number.isFinite(d)) return dayKey.trim();
  const date = new Date(y, monthIndex, d);
  if (Number.isNaN(date.getTime())) return dayKey.trim();
  const dias = labels?.days ?? DIAS_ES;
  const meses = labels?.months ?? MESES_ES;
  const fmt = labels?.dateFormat ?? '{{day}} {{date}} de {{month}}, {{year}}';
  const wd = dias[date.getDay()] ?? '';
  const mes = meses[monthIndex] ?? '';
  const wdCap = wd.charAt(0).toUpperCase() + wd.slice(1);
  return fmt
    .replace('{{day}}', wdCap)
    .replace('{{date}}', String(d))
    .replace('{{month}}', mes)
    .replace('{{year}}', String(y));
}

/** Estilos inline pensados para clientes de correo (Outlook/Gmail): compacto, ejecutivo. */
const ROOT =
  'line-height:1.45;color:#334155;font-size:13px;max-width:600px;-webkit-font-smoothing:antialiased;';
const HDR_BLOCK = 'margin:0 0 14px 0;padding:0 0 12px 0;border-bottom:1px solid #e2e8f0;';
const H1 =
  'font-size:19px;font-weight:700;letter-spacing:-0.02em;margin:0 0 2px 0;color:#0f172a;line-height:1.2;font-family:Segoe UI,Arial,Helvetica,sans-serif;';
const MP_WRAP =
  'margin:0;padding:10px 12px;background:#f8fafc;border:1px solid #e8ecf0;border-radius:4px;font-size:12px;line-height:1.4;color:#475569;';
const MP_LABEL =
  'color:#64748b;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;';
const SEP_AFTER_MP =
  'border:none;height:0;margin:0;padding:0;visibility:hidden;';
const SECTION_FIRST = 'margin:20px 0 0 0;padding:0;';
const SECTION_NEXT =
  'margin:44px 0 0 0;padding:40px 0 0 0;border-top:1px solid #e2e8f0;';
const CLIENTH3 =
  'font-size:12px;font-weight:700;margin:0 0 6px 0;padding:0 0 5px 0;border-bottom:1px solid #f1f5f9;color:#0f172a;letter-spacing:0.08em;text-transform:uppercase;font-family:Segoe UI,Arial,Helvetica,sans-serif;';
const EMPTY_P = 'margin:12px 0;font-size:12px;color:#64748b;';
const CARD_WRAP =
  'border:1px solid #e8ecf0;border-radius:8px;padding:12px 14px;margin:10px 0 0 0;background:#ffffff;';
const FMT_CARD_TITLE =
  'font-size:12px;font-weight:700;margin:0 0 10px 0;color:#0f172a;font-family:Segoe UI,Arial,Helvetica,sans-serif;';
const METRIC_LABEL_MAIL =
  'font-size:10px;color:#64748b;margin:0 0 4px 0;font-family:Segoe UI,Arial,Helvetica,sans-serif;';
const METRIC_VAL_MAIL =
  'font-size:18px;font-weight:700;margin:0;color:#0f172a;font-variant-numeric:tabular-nums;font-family:Segoe UI,Arial,Helvetica,sans-serif;line-height:1.2;';
const METRIC_VAL_CAM_MAIL =
  'font-size:18px;font-weight:700;margin:0;color:#1D9E75;font-variant-numeric:tabular-nums;font-family:Segoe UI,Arial,Helvetica,sans-serif;line-height:1.2;';
const THREE_COL_TBL = 'border-collapse:collapse;width:100%;margin:8px 0 0 0;';
const TD_METRIC_CELL =
  'vertical-align:top;text-align:center;padding:6px 4px;width:33.33%;font-family:Segoe UI,Arial,Helvetica,sans-serif;';
const TD_METRIC_MID =
  'vertical-align:top;text-align:center;padding:6px 4px;width:33.33%;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;font-family:Segoe UI,Arial,Helvetica,sans-serif;';

function htmlFormatMetricCard(
  label: string,
  n: { packed: number; camara: number; shipped: number },
  labels: EodReportLabels,
): string {
  return (
    `<div style="${CARD_WRAP}">` +
    `<p style="${FMT_CARD_TITLE}">${esc(label)}</p>` +
    `<table style="${THREE_COL_TBL}" cellpadding="0" cellspacing="0" role="presentation"><tr>` +
    `<td style="${TD_METRIC_CELL}">` +
    `<p style="${METRIC_LABEL_MAIL}">${esc(labels.packed)}</p>` +
    `<p style="${METRIC_VAL_MAIL}">${esc(formatCount(n.packed))}</p>` +
    `</td>` +
    `<td style="${TD_METRIC_MID}">` +
    `<p style="${METRIC_LABEL_MAIL}">${esc(labels.camara)}</p>` +
    `<p style="${METRIC_VAL_CAM_MAIL}">${esc(formatCount(n.camara))}</p>` +
    `</td>` +
    `<td style="${TD_METRIC_CELL}">` +
    `<p style="${METRIC_LABEL_MAIL}">${esc(labels.shipped)}</p>` +
    `<p style="${METRIC_VAL_MAIL}">${esc(formatCount(n.shipped))}</p>` +
    `</td>` +
    `</tr></table></div>`
  );
}

function normsWithAnyCajas(block: EodReportClientBlock): string[] {
  return [...block.norms]
    .filter((nk) => {
      const n = block.nums.get(nk) ?? { packed: 0, camara: 0, shipped: 0 };
      return n.packed + n.camara + n.shipped > 0;
    })
    .sort((a, b) => a.localeCompare(b));
}

export type EodReportClientBlock = {
  label: string;
  norms: string[];
  /** norm key -> packed, camara, shipped */
  nums: Map<string, { packed: number; camara: number; shipped: number }>;
  formatLabel: (nk: string) => string;
};

export function buildEodReportPlain(params: {
  /** Fecha legible en español, misma que en el encabezado HTML. */
  fechaHeaderEs: string;
  mpLine: string;
  blocks: EodReportClientBlock[];
  labels: EodReportLabels;
}): string {
  const { fechaHeaderEs, mpLine, blocks, labels } = params;
  const lines: string[] = [
    `${labels.title} · ${fechaHeaderEs}`,
    '',
    `${labels.mpLabel}:`,
    mpLine,
    '',
    '────────────────────────────────────',
  ];
  if (blocks.length === 0) {
    lines.push('');
    lines.push(labels.noMovement);
    return lines.join('\n').trim();
  }
  for (const b of blocks) {
    lines.push('');
    lines.push(`${labels.clientPrefix} ${b.label}`);
    const withData = normsWithAnyCajas(b);
    if (withData.length === 0) {
      lines.push('');
      lines.push(labels.noBoxes);
      lines.push('');
      lines.push('────────────────────────────────────');
      continue;
    }
    for (const nk of withData) {
      const n = b.nums.get(nk) ?? { packed: 0, camara: 0, shipped: 0 };
      lines.push('');
      lines.push(`— ${b.formatLabel(nk)}`);
      lines.push(
        `   ${labels.packed} · ${formatCount(n.packed)}  |  ${labels.camara} · ${formatCount(n.camara)}  |  ${labels.shipped} · ${formatCount(n.shipped)}`,
      );
    }
    lines.push('');
    lines.push('────────────────────────────────────');
  }
  return lines.join('\n').trim();
}

export function buildEodReportHtml(params: {
  fechaHeaderEs: string;
  mpLine: string;
  blocks: EodReportClientBlock[];
  labels: EodReportLabels;
}): string {
  const { fechaHeaderEs, mpLine, blocks, labels } = params;
  const parts: string[] = [];
  parts.push(
    `<div style="${HDR_BLOCK}">` +
      `<p style="${H1}">${esc(labels.title)} · ${esc(fechaHeaderEs)}</p>` +
      `</div>`,
  );
  parts.push(
    `<div style="${MP_WRAP}"><span style="${MP_LABEL}">${esc(labels.mpLabel)}</span><br/>${esc(mpLine)}</div>`,
  );
  parts.push(`<hr style="${SEP_AFTER_MP}" />`);

  if (blocks.length === 0) {
    parts.push(`<p style="${EMPTY_P}">${esc(labels.noMovement)}</p>`);
    return `<div style="${ROOT}">${parts.join('')}</div>`;
  }

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    const sectionStyle = i === 0 ? SECTION_FIRST : SECTION_NEXT;
    parts.push(`<div style="${sectionStyle}">`);
    parts.push(`<h3 style="${CLIENTH3}">${esc(labels.clientPrefix)} ${esc(b.label)}</h3>`);
    const withData = normsWithAnyCajas(b);
    if (withData.length === 0) {
      parts.push(`<p style="${EMPTY_P}">${esc(labels.noBoxes)}</p>`);
      parts.push('</div>');
      continue;
    }
    for (const nk of withData) {
      const n = b.nums.get(nk) ?? { packed: 0, camara: 0, shipped: 0 };
      parts.push(htmlFormatMetricCard(b.formatLabel(nk), n, labels));
    }
    parts.push('</div>');
  }

  return `<div style="${ROOT}">${parts.join('')}</div>`;
}

export function wrapHtmlFragmentForClipboard(
  fragment: string,
  pageTitle: string = 'End of day PT',
): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(pageTitle)}</title></head><body style="margin:0;padding:14px 14px 20px;background:#ffffff;color:#334155;font-family:Segoe UI,Arial,Helvetica,sans-serif;">${fragment}</body></html>`;
}

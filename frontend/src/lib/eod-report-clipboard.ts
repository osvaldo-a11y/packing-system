import { formatCount } from '@/lib/number-format';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Estilos inline pensados para clientes de correo (Outlook/Gmail): compacto, ejecutivo. */
const ROOT =
  'line-height:1.45;color:#334155;font-size:13px;max-width:600px;-webkit-font-smoothing:antialiased;';
const HDR_BLOCK = 'margin:0 0 14px 0;padding:0 0 12px 0;border-bottom:1px solid #e2e8f0;';
const H1 =
  'font-size:19px;font-weight:700;letter-spacing:-0.02em;margin:0 0 2px 0;color:#0f172a;line-height:1.2;font-family:Segoe UI,Arial,Helvetica,sans-serif;';
const FECHA =
  'font-size:12px;font-weight:600;margin:0;color:#64748b;letter-spacing:0.04em;text-transform:uppercase;font-family:Segoe UI,Arial,Helvetica,sans-serif;';
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
const FORMATO_P = 'margin:0 0 6px 0;font-size:12px;line-height:1.35;color:#334155;';
const FORMATO_LABEL =
  'color:#94a3b8;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;';
const FORMATO_VAL = 'color:#0f172a;font-weight:600;font-size:12px;';
const TABLE =
  'border-collapse:collapse;width:100%;max-width:600px;margin:0;font-family:Segoe UI,Arial,Helvetica,sans-serif;font-size:12px;color:#1e293b;border:1px solid #e8ecf0;';
const TH =
  'border:1px solid #e2e8f0;border-bottom:1px solid #cbd5e1;background:#f1f5f9;color:#334155;padding:5px 10px;text-align:left;font-weight:600;font-size:10px;letter-spacing:0.05em;text-transform:uppercase;';
const TH_R =
  'border:1px solid #e2e8f0;border-bottom:1px solid #cbd5e1;background:#f1f5f9;color:#334155;padding:5px 10px;text-align:right;font-weight:600;font-size:10px;letter-spacing:0.05em;text-transform:uppercase;';
const TD =
  'border:1px solid #eef1f5;background:#ffffff;padding:4px 10px;vertical-align:middle;color:#334155;line-height:1.35;';
/** Primera columna cuando es nombre de formato (tabla ancha). */
const TD_FMT =
  'border:1px solid #eef1f5;background:#ffffff;padding:4px 10px;vertical-align:middle;color:#0f172a;font-weight:600;font-size:12px;line-height:1.35;';
const TD_R =
  'border:1px solid #eef1f5;background:#ffffff;padding:4px 10px;text-align:right;vertical-align:middle;color:#0f172a;font-variant-numeric:tabular-nums;font-weight:600;font-size:12px;line-height:1.35;';
const EMPTY_P = 'margin:12px 0;font-size:12px;color:#64748b;';

export type EodReportClientBlock = {
  label: string;
  norms: string[];
  /** norm key -> packed, camara, shipped */
  nums: Map<string, { packed: number; camara: number; shipped: number }>;
  formatLabel: (nk: string) => string;
};

export function buildEodReportPlain(params: {
  fechaDdMmYyyy: string;
  mpLine: string;
  blocks: EodReportClientBlock[];
}): string {
  const { fechaDdMmYyyy, mpLine, blocks } = params;
  const lines: string[] = [
    'FIN DEL DÍA – UNIDAD PT',
    `Fecha: ${fechaDdMmYyyy}`,
    '',
    'Materia prima disponible para proceso:',
    mpLine,
    '',
    '────────────────────────────────────',
  ];
  if (blocks.length === 0) {
    lines.push('');
    lines.push('Sin movimiento por cliente para la fecha indicada.');
    return lines.join('\n').trim();
  }
  for (const b of blocks) {
    lines.push('');
    lines.push(`CLIENTE: ${b.label}`);
    const sorted = [...b.norms].sort((a, b) => a.localeCompare(b));
    if (sorted.length === 0) {
      lines.push('');
      lines.push('Métrica       Cajas');
      lines.push('');
      lines.push('---');
      lines.push('');
      lines.push(`Packed        ${formatCount(0)}`);
      lines.push(`En cámara     ${formatCount(0)}`);
      lines.push(`Shipped       ${formatCount(0)}`);
      lines.push('');
      lines.push('────────────────────────────────────');
      continue;
    }
    if (sorted.length === 1) {
      const nk = sorted[0]!;
      const n = b.nums.get(nk) ?? { packed: 0, camara: 0, shipped: 0 };
      lines.push(`Formato: ${b.formatLabel(nk)}`);
      lines.push('');
      lines.push('Métrica       Cajas');
      lines.push('');
      lines.push('---');
      lines.push('');
      lines.push(`Packed        ${formatCount(n.packed)}`);
      lines.push(`En cámara     ${formatCount(n.camara)}`);
      lines.push(`Shipped       ${formatCount(n.shipped)}`);
      lines.push('');
      lines.push('────────────────────────────────────');
      continue;
    }
    lines.push('');
    lines.push('Formato               Packed   En cámara   Shipped');
    lines.push('');
    lines.push('---');
    lines.push('');
    for (const nk of sorted) {
      const n = b.nums.get(nk) ?? { packed: 0, camara: 0, shipped: 0 };
      const lab = b.formatLabel(nk);
      lines.push(
        `${lab.padEnd(20)} ${String(formatCount(n.packed)).padStart(8)} ${String(formatCount(n.camara)).padStart(10)} ${String(formatCount(n.shipped)).padStart(7)}`,
      );
    }
    lines.push('');
    lines.push('────────────────────────────────────');
  }
  return lines.join('\n').trim();
}

export function buildEodReportHtml(params: {
  fechaDdMmYyyy: string;
  mpLine: string;
  blocks: EodReportClientBlock[];
}): string {
  const { fechaDdMmYyyy, mpLine, blocks } = params;
  const parts: string[] = [];
  parts.push(
    `<div style="${HDR_BLOCK}">` +
      `<p style="${H1}">FIN DEL DÍA – UNIDAD PT</p>` +
      `<p style="${FECHA}">Fecha · ${esc(fechaDdMmYyyy)}</p>` +
      `</div>`,
  );
  parts.push(
    `<div style="${MP_WRAP}"><span style="${MP_LABEL}">Materia prima disponible para proceso</span><br/>${esc(mpLine)}</div>`,
  );
  parts.push(`<hr style="${SEP_AFTER_MP}" />`);

  if (blocks.length === 0) {
    parts.push(`<p style="${EMPTY_P}">Sin movimiento por cliente para la fecha indicada.</p>`);
    return `<div style="${ROOT}">${parts.join('')}</div>`;
  }

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    const sectionStyle = i === 0 ? SECTION_FIRST : SECTION_NEXT;
    parts.push(`<div style="${sectionStyle}">`);
    parts.push(`<h3 style="${CLIENTH3}">CLIENTE: ${esc(b.label)}</h3>`);
    const sorted = [...b.norms].sort((a, b) => a.localeCompare(b));
    if (sorted.length === 0) {
      parts.push(
        `<table style="${TABLE}" cellpadding="0" cellspacing="0"><thead><tr><th style="${TH}">Métrica</th><th style="${TH_R}">Cajas</th></tr></thead><tbody>` +
          `<tr><td style="${TD}">Packed</td><td style="${TD_R}">${esc(formatCount(0))}</td></tr>` +
          `<tr><td style="${TD}">En cámara</td><td style="${TD_R}">${esc(formatCount(0))}</td></tr>` +
          `<tr><td style="${TD}">Shipped</td><td style="${TD_R}">${esc(formatCount(0))}</td></tr></tbody></table>`,
      );
      parts.push('</div>');
      continue;
    }
    if (sorted.length === 1) {
      const nk = sorted[0]!;
      const n = b.nums.get(nk) ?? { packed: 0, camara: 0, shipped: 0 };
      parts.push(
        `<p style="${FORMATO_P}"><span style="${FORMATO_LABEL}">Formato · </span><span style="${FORMATO_VAL}">${esc(b.formatLabel(nk))}</span></p>`,
      );
      parts.push(
        `<table style="${TABLE}" cellpadding="0" cellspacing="0"><thead><tr><th style="${TH}">Métrica</th><th style="${TH_R}">Cajas</th></tr></thead><tbody>` +
          `<tr><td style="${TD}">Packed</td><td style="${TD_R}">${esc(formatCount(n.packed))}</td></tr>` +
          `<tr><td style="${TD}">En cámara</td><td style="${TD_R}">${esc(formatCount(n.camara))}</td></tr>` +
          `<tr><td style="${TD}">Shipped</td><td style="${TD_R}">${esc(formatCount(n.shipped))}</td></tr></tbody></table>`,
      );
      parts.push('</div>');
      continue;
    }
    parts.push(
      `<table style="${TABLE}" cellpadding="0" cellspacing="0"><thead><tr>` +
        `<th style="${TH}">Formato</th><th style="${TH_R}">Packed</th><th style="${TH_R}">En cámara</th><th style="${TH_R}">Shipped</th></tr></thead><tbody>`,
    );
    for (const nk of sorted) {
      const n = b.nums.get(nk) ?? { packed: 0, camara: 0, shipped: 0 };
      parts.push(
        `<tr><td style="${TD_FMT}">${esc(b.formatLabel(nk))}</td>` +
          `<td style="${TD_R}">${esc(formatCount(n.packed))}</td>` +
          `<td style="${TD_R}">${esc(formatCount(n.camara))}</td>` +
          `<td style="${TD_R}">${esc(formatCount(n.shipped))}</td></tr>`,
      );
    }
    parts.push('</tbody></table>');
    parts.push('</div>');
  }

  return `<div style="${ROOT}">${parts.join('')}</div>`;
}

export function wrapHtmlFragmentForClipboard(fragment: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fin del día PT</title></head><body style="margin:0;padding:14px 14px 20px;background:#ffffff;color:#334155;font-family:Segoe UI,Arial,Helvetica,sans-serif;">${fragment}</body></html>`;
}

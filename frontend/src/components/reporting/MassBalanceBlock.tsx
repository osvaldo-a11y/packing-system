import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { apiJson } from '@/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { kpiLabel, kpiValueMd, contentCard } from '@/lib/page-ui';
import ExcelJS from 'exceljs';

type RawRow = Record<string, unknown>;

type SettlementData = {
  producerSettlementSummary?: { rows: RawRow[] };
  producerSettlementDetail?: { rows: RawRow[] };
} | null;

type ProcessDetail = {
  proceso_id: number;
  recepcion_id: number;
  fecha: string;
  variedad: string;
  tipo_recepcion: string;
  is_machine: boolean;
  lb_entrada: number;
  lb_packout: number;
  pct_packout: number;
  cajas_pt: number;
};
type ProducerBalance = {
  productor_id: number;
  productor_nombre: string;
  recepciones: number;
  lb_recepcionado: number;
  procesos: number;
  lb_procesado: number;
  lb_packout: number;
  lb_merma: number;
  pct_packout: number;
  lb_facturado: number;
  diferencia: number;
  detalle: ProcessDetail[];
};
type MassBalanceData = {
  producers: ProducerBalance[];
  totales: {
    lb_recepcionado: number;
    lb_procesado: number;
    lb_packout: number;
    lb_merma: number;
    lb_facturado: number;
    diferencia: number;
  };
};

const fmt = (n: number, dec = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtPct = (n: number) => `${fmt(n, 2)}%`;
const C = {
  headerBg: 'FF1E3A5F',
  headerFg: 'FFFFFFFF',
  totalBg: 'FFEEF2F8',
  totalFg: 'FF1E3A5F',
  borderMd: 'FF8BADD3',
};
const FMT_LB = '#,##0.00';
const FMT_PCT = '0.00"%"';
const FMT_QTY = '#,##0';

function styleHeader(row: ExcelJS.Row, n: number) {
  for (let i = 1; i <= n; i++) {
    const c = row.getCell(i);
    c.font = { bold: true, color: { argb: C.headerFg }, size: 10, name: 'Arial' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headerBg } };
    c.alignment = { vertical: 'middle', wrapText: true };
    c.border = { bottom: { style: 'thin', color: { argb: C.borderMd } } };
  }
  row.height = 26;
}
function styleTotal(row: ExcelJS.Row, n: number) {
  for (let i = 1; i <= n; i++) {
    const c = row.getCell(i);
    c.font = { bold: true, size: 10, color: { argb: C.totalFg }, name: 'Arial' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.totalBg } };
    c.border = { top: { style: 'medium', color: { argb: C.borderMd } } };
  }
  row.height = 22;
}

async function buildMassBalanceExcel(
  data: MassBalanceData,
  producerIds: number[] | 'all',
  lang: 'es' | 'en',
  period: string,
  company: string,
  settlementData?: SettlementData,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Packing system — Mass Balance';
  wb.created = new Date();
  const emission = new Date().toLocaleString(lang === 'en' ? 'en-US' : 'es-AR', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  const L =
    lang === 'en'
      ? {
          sheetSummary: 'Summary',
          sheetDetail: (n: string) => `${n.slice(0, 25)}`,
          title: 'Mass Balance by Producer',
          colProducer: 'Producer',
          colRec: 'Receptions',
          colLbRec: 'Lb Received',
          colProc: 'Processes',
          colLbProc: 'Lb Processed',
          colPackout: 'Lb Packout',
          colMerma: 'Lb Waste',
          colPct: '% Packout',
          colFact: 'Lb Invoiced',
          colDiff: 'Difference',
          total: 'TOTAL',
          detProc: 'Process',
          detRec: 'Reception',
          detFecha: 'Date',
          detVar: 'Variety',
          detTipo: 'Type',
          detEnt: 'Lb Input',
          detPack: 'Lb Packout',
          detPct: '% Packout',
          detCajas: 'Boxes PT',
          periodo: 'Period',
          emitido: 'Issued',
        }
      : {
          sheetSummary: 'Resumen',
          sheetDetail: (n: string) => `${n.slice(0, 25)}`,
          title: 'Balance de masas por productor',
          colProducer: 'Productor',
          colRec: 'Recepciones',
          colLbRec: 'Lb Recibido',
          colProc: 'Procesos',
          colLbProc: 'Lb Procesado',
          colPackout: 'Lb Packout',
          colMerma: 'Lb Merma',
          colPct: '% Packout',
          colFact: 'Lb Facturado',
          colDiff: 'Diferencia',
          total: 'TOTAL',
          detProc: 'Proceso',
          detRec: 'Recepción',
          detFecha: 'Fecha',
          detVar: 'Variedad',
          detTipo: 'Tipo',
          detEnt: 'Lb Entrada',
          detPack: 'Lb Packout',
          detPct: '% Packout',
          detCajas: 'Cajas PT',
          periodo: 'Período',
          emitido: 'Emitido',
        };

  const producers =
    producerIds === 'all' ? data.producers : data.producers.filter((p) => producerIds.includes(p.productor_id));

  const wsSummary = wb.addWorksheet(L.sheetSummary);
  const COL_S = 10;
  const r0 = wsSummary.addRow([company || L.title]);
  wsSummary.mergeCells(r0.number, 1, r0.number, COL_S);
  r0.getCell(1).font = { bold: true, size: 12, name: 'Arial', color: { argb: C.headerBg } };
  r0.height = 24;
  const r1 = wsSummary.addRow([`${L.periodo}: ${period}   ·   ${L.emitido}: ${emission}`]);
  wsSummary.mergeCells(r1.number, 1, r1.number, COL_S);
  r1.getCell(1).font = { size: 9, name: 'Arial' };
  r1.height = 18;
  wsSummary.addRow([]);
  const hRow = wsSummary.addRow([
    L.colProducer,
    L.colRec,
    L.colLbRec,
    L.colProc,
    L.colLbProc,
    L.colPackout,
    L.colMerma,
    L.colPct,
    L.colFact,
    L.colDiff,
  ]);
  styleHeader(hRow, COL_S);
  wsSummary.autoFilter = { from: { row: hRow.number, column: 1 }, to: { row: hRow.number, column: COL_S } };

  for (const p of producers) {
    const row = wsSummary.addRow([
      p.productor_nombre,
      p.recepciones,
      p.lb_recepcionado,
      p.procesos,
      p.lb_procesado,
      p.lb_packout,
      p.lb_merma,
      p.pct_packout / 100,
      p.lb_facturado,
      p.diferencia,
    ]);
    row.height = 18;
    row.getCell(1).font = { size: 9, name: 'Arial' };
    [3, 5, 6, 7, 9, 10].forEach((i) => {
      row.getCell(i).numFmt = FMT_LB;
      row.getCell(i).alignment = { horizontal: 'right' };
    });
    row.getCell(8).numFmt = FMT_PCT;
    row.getCell(8).alignment = { horizontal: 'right' };
    [2, 4].forEach((i) => {
      row.getCell(i).numFmt = FMT_QTY;
      row.getCell(i).alignment = { horizontal: 'right' };
    });
  }
  const tot = {
    lb_recepcionado: producers.reduce((s, p) => s + p.lb_recepcionado, 0),
    lb_procesado: producers.reduce((s, p) => s + p.lb_procesado, 0),
    lb_packout: producers.reduce((s, p) => s + p.lb_packout, 0),
    lb_merma: producers.reduce((s, p) => s + p.lb_merma, 0),
    lb_facturado: producers.reduce((s, p) => s + p.lb_facturado, 0),
    diferencia: producers.reduce((s, p) => s + p.diferencia, 0),
  };
  const totRow = wsSummary.addRow([
    L.total,
    '',
    tot.lb_recepcionado,
    '',
    tot.lb_procesado,
    tot.lb_packout,
    tot.lb_merma,
    tot.lb_packout / (tot.lb_recepcionado || 1),
    tot.lb_facturado,
    tot.diferencia,
  ]);
  styleTotal(totRow, COL_S);
  [3, 5, 6, 7, 9, 10].forEach((i) => {
    totRow.getCell(i).numFmt = FMT_LB;
  });
  totRow.getCell(8).numFmt = FMT_PCT;
  wsSummary.columns = [
    { width: 28 },
    { width: 12 },
    { width: 16 },
    { width: 12 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
    { width: 12 },
    { width: 16 },
    { width: 14 },
  ];

  const wsDisp = wb.addWorksheet(lang === 'en' ? 'Dispatches' : 'Despachos');
  const COL_DISP = 7;
  const dispHdr = wsDisp.addRow([
    lang === 'en' ? 'Producer' : 'Productor',
    lang === 'en' ? 'Dispatch #' : 'N° Despacho',
    lang === 'en' ? 'Date' : 'Fecha',
    lang === 'en' ? 'BOL' : 'BOL',
    lang === 'en' ? 'Format' : 'Formato',
    lang === 'en' ? 'Lb Invoiced' : 'Lb Facturado',
    lang === 'en' ? 'Sales' : 'Ventas',
  ]);
  styleHeader(dispHdr, COL_DISP);

  const settlementDetailRows = settlementData?.producerSettlementDetail?.rows ?? [];
  const dispRows = settlementDetailRows.filter((r) =>
    producers.some((p) => p.productor_id === Number(r.productor_id)),
  );

  let sumLbDisp = 0;
  let sumVentasDisp = 0;
  for (const r of dispRows) {
    const lb = Number(r.lb ?? 0);
    const vt = Number(r.ventas ?? 0);
    sumLbDisp += lb;
    sumVentasDisp += vt;
    const dr = wsDisp.addRow([
      String(r.productor_nombre ?? ''),
      Number(r.dispatch_number ?? r.dispatch_id ?? 0),
      String(r.fecha_despacho ?? ''),
      String(r.numero_bol ?? '—'),
      String(r.format_code ?? '—'),
      lb,
      vt,
    ]);
    dr.height = 18;
    dr.getCell(6).numFmt = FMT_LB;
    dr.getCell(6).alignment = { horizontal: 'right' };
    dr.getCell(7).numFmt = '"$"#,##0.00';
    dr.getCell(7).alignment = { horizontal: 'right' };
    dr.getCell(1).font = { size: 9, name: 'Arial' };
  }

  const dispTot = wsDisp.addRow(['', '', '', '', lang === 'en' ? 'TOTAL' : 'TOTAL', sumLbDisp, sumVentasDisp]);
  dispTot.getCell(6).numFmt = FMT_LB;
  dispTot.getCell(7).numFmt = '"$"#,##0.00';
  styleTotal(dispTot, COL_DISP);
  wsDisp.columns = [
    { width: 28 },
    { width: 13 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ];

  for (const p of producers) {
    const wsFee = wb.addWorksheet((lang === 'en' ? 'PackFee ' : 'Fees ') + p.productor_nombre.slice(0, 20));
    const COL_FEE = 5;
    const feeTitle = wsFee.addRow([p.productor_nombre]);
    wsFee.mergeCells(feeTitle.number, 1, feeTitle.number, COL_FEE);
    feeTitle.getCell(1).font = { bold: true, size: 11, name: 'Arial', color: { argb: C.headerBg } };
    feeTitle.height = 22;

    wsFee.addRow([]);

    const feeHdr = wsFee.addRow([
      lang === 'en' ? 'Service' : 'Servicio',
      lang === 'en' ? 'Rate ($/lb)' : 'Tarifa ($/lb)',
      lang === 'en' ? 'Lb Base' : 'Lb Base',
      lang === 'en' ? 'Amount' : 'Monto',
      lang === 'en' ? 'Notes' : 'Notas',
    ]);
    styleHeader(feeHdr, COL_FEE);

    const lbMaquina = p.detalle.filter((d) => d.is_machine).reduce((s, d) => s + d.lb_packout, 0);
    const lbTotal = p.lb_packout;

    const settlementSummaryRows = settlementData?.producerSettlementSummary?.rows ?? [];
    const settlementRow = settlementSummaryRows.find((r) => Number(r.productor_id) === p.productor_id);
    const packBase = settlementRow ? Number(settlementRow.costo_packing_base ?? 0) : lbTotal * 0.45;
    const recargoFmt = settlementRow ? Number(settlementRow.recargo_formato ?? 0) : 0;
    const costoMaq = settlementRow ? Number(settlementRow.costo_maquina ?? 0) : lbMaquina * 0.1;
    const totalPack = settlementRow ? Number(settlementRow.total_packing ?? 0) : packBase + recargoFmt + costoMaq;
    const ventas = settlementRow ? Number(settlementRow.ventas ?? 0) : 0;
    const costoMat = settlementRow ? Number(settlementRow.costo_materiales ?? 0) : 0;
    const netoProductor = settlementRow ? Number(settlementRow.neto_productor ?? 0) : 0;

    // ── Lb por formato premium (del detalle de liquidación) ──
    const detailRows = (settlementData?.producerSettlementDetail?.rows ?? [])
      .filter((r) => Number(r.productor_id) === p.productor_id);

    // Agrupar lb por formato
    const lbByFormat = new Map<string, number>();
    for (const r of detailRows) {
      const fmt = String(r.format_code ?? '').trim();
      if (!fmt) continue;
      lbByFormat.set(fmt, (lbByFormat.get(fmt) ?? 0) + Number(r.lb ?? 0));
    }

    // Formatos premium con recargo (12x9.8oz = $0.55/lb)
    const PREMIUM_FORMATS = ['12x9.8oz', '12x9.8OZ', '9.8oz', '9.8OZ'];
    const lbPremium = PREMIUM_FORMATS.reduce((s, fmt) => s + (lbByFormat.get(fmt) ?? 0), 0);
    const tarifaRecargo = lbPremium > 0 && recargoFmt > 0 ? recargoFmt / lbPremium : 0.55;

    const services = [
      {
        nombre: lang === 'en' ? 'Blueberry packing service' : 'Servicio packing arándano',
        tarifa: lbTotal > 0 ? packBase / lbTotal : 0.45,
        lb: lbTotal,
        monto: packBase,
        nota: lang === 'en' ? 'Base rate per lb packed' : 'Tarifa base por lb empacada',
      },
      {
        nombre: lang === 'en' ? 'Format surcharge — 12x9.8oz (size/jumbo)' : 'Recargo formato — 12x9.8oz (size/jumbo)',
        tarifa: tarifaRecargo,
        lb: lbPremium,
        monto: recargoFmt,
        nota: lang === 'en'
          ? `Premium format lb: ${lbPremium.toLocaleString('en-US', {maximumFractionDigits: 2})}`
          : `Lb formato premium: ${lbPremium.toLocaleString('es-AR', {maximumFractionDigits: 2})}`,
      },
      {
        nombre: lang === 'en' ? 'Machine processing fee' : 'Servicio procesado máquina',
        tarifa: lbMaquina > 0 ? costoMaq / lbMaquina : 0.10,
        lb: lbMaquina,
        monto: costoMaq,
        nota: lang === 'en' ? 'Applied only to machine-picked fruit' : 'Solo fruta cosecha máquina',
      },
    ];

    for (const svc of services) {
      const monto = svc.monto;
      const feeRow = wsFee.addRow([svc.nombre, svc.tarifa, svc.lb, monto, svc.nota]);
      feeRow.height = 18;
      feeRow.getCell(2).numFmt = '"$"#,##0.000';
      feeRow.getCell(3).numFmt = FMT_LB;
      feeRow.getCell(4).numFmt = '"$"#,##0.00';
      [2, 3, 4].forEach((i) => {
        feeRow.getCell(i).alignment = { horizontal: 'right' };
      });
      feeRow.getCell(1).font = { size: 9, name: 'Arial' };
      feeRow.getCell(5).font = { size: 8, name: 'Arial', color: { argb: 'FF666666' }, italic: true };
    }

    const feeTotal = services.reduce((s, sv) => s + sv.monto, 0);
    const feeTotRow = wsFee.addRow([
      lang === 'en' ? 'TOTAL PACK FEE (base)' : 'TOTAL PACK FEE (base)',
      '',
      '',
      feeTotal,
      '',
    ]);
    styleTotal(feeTotRow, COL_FEE);
    feeTotRow.getCell(4).numFmt = '"$"#,##0.00';

    wsFee.addRow([]);
    const summaryRows2 = [
      { label: lang === 'en' ? 'Sales' : 'Ventas', value: ventas, isNet: false },
      { label: lang === 'en' ? 'Material cost' : 'Costo materiales', value: costoMat, isNet: false },
      { label: lang === 'en' ? 'Total packing' : 'Total packing', value: totalPack, isNet: false },
      { label: lang === 'en' ? 'Producer net' : 'Neto productor', value: netoProductor, isNet: true },
    ];
    for (const sr of summaryRows2) {
      const srRow = wsFee.addRow([sr.label, '', '', sr.value, '']);
      srRow.getCell(1).font = {
        bold: sr.isNet,
        size: 10,
        name: 'Arial',
      };
      srRow.getCell(4).numFmt = '"$"#,##0.00';
      srRow.getCell(4).alignment = { horizontal: 'right' };
      if (sr.isNet) {
        styleTotal(srRow, COL_FEE);
        srRow.getCell(4).numFmt = '"$"#,##0.00';
      }
    }

    wsFee.addRow([]);
    const noteRow = wsFee.addRow([
      lang === 'en'
        ? '* Format surcharge (Jumbo/size premium) is detailed in the settlement Excel by format.'
        : '* El recargo por formato (premium Jumbo/size) está detallado en el Excel de liquidación por formato.',
    ]);
    wsFee.mergeCells(noteRow.number, 1, noteRow.number, COL_FEE);
    noteRow.getCell(1).font = { size: 8, name: 'Arial', italic: true, color: { argb: 'FF666666' } };

    wsFee.columns = [{ width: 36 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 48 }];
  }

  const tipoLabelXls = (tipo: string): string => {
    const t = tipo.toLowerCase();
    if (t.includes('machine') || t.includes('máquina') || t.includes('maquina'))
      return lang === 'en' ? 'Machine' : 'Máquina';
    if (t.includes('hand') || t.includes('mano')) return lang === 'en' ? 'Hand' : 'Mano';
    return lang === 'en' ? 'Mixed' : 'Mixto';
  };

  for (const p of producers) {
    const ws = wb.addWorksheet(L.sheetDetail(p.productor_nombre));
    const COL_D = 9;
    const rh0 = ws.addRow([p.productor_nombre]);
    ws.mergeCells(rh0.number, 1, rh0.number, COL_D);
    rh0.getCell(1).font = { bold: true, size: 11, name: 'Arial', color: { argb: C.headerBg } };
    rh0.height = 22;
    const rh1 = ws.addRow([`${L.periodo}: ${period}   ·   ${L.emitido}: ${emission}`]);
    ws.mergeCells(rh1.number, 1, rh1.number, COL_D);
    rh1.getCell(1).font = { size: 9, name: 'Arial' };
    rh1.height = 18;
    ws.addRow([]);
    const dh = ws.addRow([
      L.detProc,
      L.detRec,
      L.detFecha,
      L.detVar,
      L.detTipo,
      L.detEnt,
      L.detPack,
      L.detPct,
      L.detCajas,
    ]);
    styleHeader(dh, COL_D);
    let sumEnt = 0;
    let sumPack = 0;
    let sumCajas = 0;
    for (const d of p.detalle) {
      const dr = ws.addRow([
        d.proceso_id,
        d.recepcion_id,
        d.fecha,
        d.variedad,
        d.is_machine ? (lang === 'en' ? 'Machine' : 'Máquina') : tipoLabelXls(d.tipo_recepcion),
        d.lb_entrada,
        d.lb_packout,
        d.pct_packout / 100,
        d.cajas_pt,
      ]);
      dr.height = 18;
      [6, 7].forEach((i) => {
        dr.getCell(i).numFmt = FMT_LB;
        dr.getCell(i).alignment = { horizontal: 'right' };
      });
      dr.getCell(8).numFmt = FMT_PCT;
      dr.getCell(8).alignment = { horizontal: 'right' };
      dr.getCell(9).numFmt = FMT_QTY;
      dr.getCell(9).alignment = { horizontal: 'right' };
      sumEnt += d.lb_entrada;
      sumPack += d.lb_packout;
      sumCajas += d.cajas_pt;
    }
    const dt = ws.addRow([L.total, '', '', '', '', sumEnt, sumPack, sumPack / (sumEnt || 1), sumCajas]);
    styleTotal(dt, COL_D);
    dt.getCell(6).numFmt = FMT_LB;
    dt.getCell(7).numFmt = FMT_LB;
    dt.getCell(8).numFmt = FMT_PCT;
    dt.getCell(9).numFmt = FMT_QTY;
    ws.columns = [
      { width: 12 },
      { width: 12 },
      { width: 14 },
      { width: 20 },
      { width: 14 },
      { width: 16 },
      { width: 16 },
      { width: 12 },
      { width: 12 },
    ];
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = lang === 'en' ? 'mass-balance.xlsx' : 'balance-masas.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

export function MassBalanceBlock({ company = '' }: { company?: string }) {
  const { i18n } = useTranslation('common');
  const lang = i18n.language.startsWith('en') ? 'en' : 'es';
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MassBalanceData | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [settlementData, setSettlementData] = useState<SettlementData>(null);

  const L =
    lang === 'en'
      ? {
          title: 'Mass balance by producer',
          subtitle: 'Reception → Processing → Packout → Invoiced. Complete traceability by producer.',
          desde: 'From',
          hasta: 'To',
          generate: 'Generate',
          generating: 'Generating…',
          colProducer: 'Producer',
          colRec: 'Rec.',
          colLbRec: 'Lb Received',
          colProc: 'Proc.',
          colPackout: 'Lb Packout',
          colMerma: 'Lb Waste',
          colPct: '% Packout',
          colFact: 'Lb Invoiced',
          colDiff: 'Difference',
          total: 'TOTAL',
          dlAll: 'Excel — All producers',
          dlOne: 'Excel',
          detFecha: 'Date',
          detVar: 'Variety',
          detTipo: 'Type',
          detEnt: 'Lb Input',
          detPack: 'Lb Packout',
          detPct: '% Packout',
          detCajas: 'Boxes PT',
          noData: 'Generate the report to see the mass balance.',
          maquina: 'Machine',
          mano: 'Hand',
          mixto: 'Mixed',
        }
      : {
          title: 'Balance de masas por productor',
          subtitle: 'Recepción → Procesado → Packout → Facturado. Trazabilidad completa por productor.',
          desde: 'Desde',
          hasta: 'Hasta',
          generate: 'Generar',
          generating: 'Generando…',
          colProducer: 'Productor',
          colRec: 'Rec.',
          colLbRec: 'Lb Recibido',
          colProc: 'Proc.',
          colPackout: 'Lb Packout',
          colMerma: 'Lb Merma',
          colPct: '% Packout',
          colFact: 'Lb Facturado',
          colDiff: 'Diferencia',
          total: 'TOTAL',
          dlAll: 'Excel — Todos los productores',
          dlOne: 'Excel',
          detFecha: 'Fecha',
          detVar: 'Variedad',
          detTipo: 'Tipo',
          detEnt: 'Lb Entrada',
          detPack: 'Lb Packout',
          detPct: '% Packout',
          detCajas: 'Cajas PT',
          noData: 'Generá el reporte para ver el balance de masas.',
          maquina: 'Máquina',
          mano: 'Mano',
          mixto: 'Mixto',
        };

  const tipoLabel = (tipo: string, isMachine?: boolean) => {
    if (isMachine) return L.maquina;
    const t = tipo.toLowerCase();
    if (t.includes('hand') || t.includes('mano')) return L.mano;
    return L.mixto;
  };

  const period = desde && hasta ? `${desde} → ${hasta}` : lang === 'en' ? 'Full period' : 'Período completo';

  const generate = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (desde) params.set('desde', desde);
      if (hasta) params.set('hasta', hasta);
      const settlementParams = new URLSearchParams();
      if (desde) settlementParams.set('fecha_desde', desde);
      if (hasta) settlementParams.set('fecha_hasta', hasta);
      settlementParams.set('page', '1');
      settlementParams.set('limit', '9999');

      const [massResult, settlementResult] = await Promise.all([
        apiJson<MassBalanceData>(`/api/reporting/mass-balance?${params}`),
        apiJson<{
          producerSettlementSummary?: { rows: RawRow[] };
          producerSettlementDetail?: { rows: RawRow[] };
        }>(`/api/reporting/producer-settlement?${settlementParams}`).catch(() => null),
      ]);
      setData(massResult);
      setSettlementData(settlementResult);
      setExpanded(new Set());
      if (!massResult.producers?.length) {
        toast.info(lang === 'en' ? 'No data for this period.' : 'Sin datos para este período.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(lang === 'en' ? `Mass balance failed: ${msg}` : `Error al generar balance: ${msg}`);
      setData(null);
      setSettlementData(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const downloadExcel = async (producerIds: number[] | 'all') => {
    if (!data) return;
    setDownloading(true);
    try {
      await buildMassBalanceExcel(data, producerIds, lang, period, company, settlementData);
    } finally {
      setDownloading(false);
    }
  };

  const ACCENT = 'text-[#1a3a5c]';

  return (
    <div className={cn(contentCard, 'p-4 sm:p-5 space-y-5')}>
      <div>
        <h2 className={cn('text-lg font-semibold', ACCENT)}>{L.title}</h2>
        <p className="text-sm text-slate-500 mt-0.5">{L.subtitle}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label className="text-xs text-slate-500">{L.desde}</Label>
          <Input type="date" className="h-9 w-40" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs text-slate-500">{L.hasta}</Label>
          <Input type="date" className="h-9 w-40" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <Button
          type="button"
          className="h-9 bg-[#1a3a5c] hover:bg-[#142d4a] text-white"
          onClick={generate}
          disabled={loading}
        >
          {loading ? L.generating : L.generate}
        </Button>
        {data && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-2 ml-auto"
            disabled={downloading}
            onClick={() => void downloadExcel('all')}
          >
            <Download className="h-4 w-4" />
            {L.dlAll}
          </Button>
        )}
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: L.colLbRec, value: data.totales.lb_recepcionado },
            { label: L.colPackout, value: data.totales.lb_packout },
            { label: L.colMerma, value: data.totales.lb_merma },
            { label: L.colFact, value: data.totales.lb_facturado },
            {
              label: L.colDiff,
              value: data.totales.diferencia,
              color: Math.abs(data.totales.diferencia) < 1 ? 'text-emerald-700' : 'text-amber-700',
            },
            {
              label: L.colPct,
              value:
                data.totales.lb_recepcionado > 0
                  ? (data.totales.lb_packout / data.totales.lb_recepcionado) * 100
                  : 0,
              isPct: true,
            },
          ].map((k, i) => (
            <div key={i} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm">
              <p className={kpiLabel}>{k.label}</p>
              <p className={cn(kpiValueMd, 'text-lg', k.color)}>{k.isPct ? fmtPct(k.value) : fmt(k.value)}</p>
            </div>
          ))}
        </div>
      )}

      {data ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#1a3a5c]">
                <TableHead className="text-white text-xs w-8"></TableHead>
                <TableHead className="text-white text-xs">{L.colProducer}</TableHead>
                <TableHead className="text-white text-xs text-right">{L.colRec}</TableHead>
                <TableHead className="text-white text-xs text-right">{L.colLbRec}</TableHead>
                <TableHead className="text-white text-xs text-right">{L.colProc}</TableHead>
                <TableHead className="text-white text-xs text-right">{L.colPackout}</TableHead>
                <TableHead className="text-white text-xs text-right">{L.colMerma}</TableHead>
                <TableHead className="text-white text-xs text-right">{L.colPct}</TableHead>
                <TableHead className="text-white text-xs text-right">{L.colFact}</TableHead>
                <TableHead className="text-white text-xs text-right">{L.colDiff}</TableHead>
                <TableHead className="text-white text-xs"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.producers.map((p) => (
                <Fragment key={p.productor_id}>
                  <TableRow
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => toggleExpanded(p.productor_id)}
                  >
                    <TableCell className="py-2">
                      {expanded.has(p.productor_id) ? (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      )}
                    </TableCell>
                    <TableCell className="py-2 font-medium text-sm">{p.productor_nombre}</TableCell>
                    <TableCell className="py-2 text-right text-sm tabular-nums">{p.recepciones}</TableCell>
                    <TableCell className="py-2 text-right text-sm tabular-nums">{fmt(p.lb_recepcionado)}</TableCell>
                    <TableCell className="py-2 text-right text-sm tabular-nums">{p.procesos}</TableCell>
                    <TableCell className="py-2 text-right text-sm tabular-nums font-medium text-[#1a3a5c]">
                      {fmt(p.lb_packout)}
                    </TableCell>
                    <TableCell className="py-2 text-right text-sm tabular-nums text-slate-500">
                      {fmt(p.lb_merma)}
                    </TableCell>
                    <TableCell className="py-2 text-right text-sm tabular-nums">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          p.pct_packout >= 80
                            ? 'bg-emerald-50 text-emerald-700'
                            : p.pct_packout >= 60
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-red-50 text-red-700',
                        )}
                      >
                        {fmtPct(p.pct_packout)}
                      </span>
                    </TableCell>
                    <TableCell className="py-2 text-right text-sm tabular-nums">{fmt(p.lb_facturado)}</TableCell>
                    <TableCell className="py-2 text-right text-sm tabular-nums">
                      <span
                        className={cn(Math.abs(p.diferencia) < 1 ? 'text-emerald-700' : 'text-amber-700')}
                      >
                        {fmt(p.diferencia)}
                      </span>
                    </TableCell>
                    <TableCell className="py-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          void downloadExcel([p.productor_id]);
                        }}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        {L.dlOne}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expanded.has(p.productor_id) && (
                    <TableRow>
                      <TableCell colSpan={11} className="bg-slate-50/70 p-0">
                        <div className="overflow-x-auto px-4 py-3">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-slate-100">
                                {[L.detFecha, L.detVar, L.detTipo, L.detEnt, L.detPack, L.detPct, L.detCajas].map(
                                  (h) => (
                                    <TableHead key={h} className="text-xs text-slate-600 py-1.5">
                                      {h}
                                    </TableHead>
                                  ),
                                )}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {p.detalle.map((d) => (
                                <TableRow key={d.proceso_id} className="text-xs">
                                  <TableCell className="py-1.5 tabular-nums">{d.fecha}</TableCell>
                                  <TableCell className="py-1.5">{d.variedad}</TableCell>
                                  <TableCell className="py-1.5">
                                    <span
                                      className={cn(
                                        'rounded px-1.5 py-0.5 text-[10px] font-medium',
                                        d.is_machine
                                          ? 'bg-blue-50 text-blue-700'
                                          : 'bg-green-50 text-green-700',
                                      )}
                                    >
                                      {tipoLabel(d.tipo_recepcion, d.is_machine)}
                                    </span>
                                  </TableCell>
                                  <TableCell className="py-1.5 text-right tabular-nums">
                                    {fmt(d.lb_entrada)}
                                  </TableCell>
                                  <TableCell className="py-1.5 text-right tabular-nums font-medium">
                                    {fmt(d.lb_packout)}
                                  </TableCell>
                                  <TableCell className="py-1.5 text-right tabular-nums">
                                    <span
                                      className={cn(
                                        'rounded px-1.5 py-0.5 text-[10px]',
                                        d.pct_packout >= 80
                                          ? 'bg-emerald-50 text-emerald-700'
                                          : d.pct_packout >= 60
                                            ? 'bg-amber-50 text-amber-700'
                                            : 'bg-red-50 text-red-700',
                                      )}
                                    >
                                      {fmtPct(d.pct_packout)}
                                    </span>
                                  </TableCell>
                                  <TableCell className="py-1.5 text-right tabular-nums">{d.cajas_pt}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
              <TableRow className="bg-[#eef2f8] font-bold">
                <TableCell></TableCell>
                <TableCell className="text-sm">{L.total}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {data.producers.reduce((s, p) => s + p.recepciones, 0)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {fmt(data.totales.lb_recepcionado)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {data.producers.reduce((s, p) => s + p.procesos, 0)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums text-[#1a3a5c]">
                  {fmt(data.totales.lb_packout)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">{fmt(data.totales.lb_merma)}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {fmtPct(
                    data.totales.lb_recepcionado > 0
                      ? (data.totales.lb_packout / data.totales.lb_recepcionado) * 100
                      : 0,
                  )}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">{fmt(data.totales.lb_facturado)}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  <span
                    className={cn(Math.abs(data.totales.diferencia) < 1 ? 'text-emerald-700' : 'text-amber-700')}
                  >
                    {fmt(data.totales.diferencia)}
                  </span>
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-8 text-center">{L.noData}</p>
      )}
    </div>
  );
}

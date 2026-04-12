import type { FinalPallet, FinalPalletLine } from '../final-pallet/final-pallet.entities';
import type { FruitProcess } from '../process/process.entities';

/** Línea de factura comercial agrupada (formato × variedad × marca × trazabilidad); no toca stock. */
export type CommercialInvoiceLine = {
  formatId: number | null;
  formatCode: string;
  varietyId: number | null;
  varietyName: string | null;
  speciesId: number | null;
  brandId: number | null;
  brandName: string | null;
  cajas: number;
  pounds: number;
  unitPrice: number;
  lineSubtotal: number;
};

export type CommercialInvoiceLineWithTrace = CommercialInvoiceLine & {
  tarja_id: number | null;
  final_pallet_id: number | null;
  fruit_process_id: number | null;
  traceability_note: string | null;
};

function resolveLineTrace(
  fp: FinalPallet,
  ln: FinalPalletLine,
): { tarjaId: number | null; fruitProcessId: number | null; note: string | null } {
  const proc = ln.fruit_process as FruitProcess | undefined | null;
  const fruitProcessId = ln.fruit_process_id != null ? Number(ln.fruit_process_id) : null;
  const tarjaFromProcess =
    proc?.tarja_id != null && Number(proc.tarja_id) > 0 ? Number(proc.tarja_id) : null;
  if (tarjaFromProcess != null) {
    return { tarjaId: tarjaFromProcess, fruitProcessId, note: null };
  }
  if (fruitProcessId != null) {
    return {
      tarjaId: null,
      fruitProcessId,
      note: 'Proceso sin unidad PT en fruit_process; liquidación puede usar productor vía proceso.',
    };
  }
  return {
    tarjaId: null,
    fruitProcessId: null,
    note: 'Línea de pallet sin proceso asociado; sin unidad PT para liquidación.',
  };
}

/**
 * Agrupa líneas de pallet final por formato, variedad, marca y **trazabilidad** (unidad PT o proceso/pallet).
 * Si mezcla fruta de distintas unidades PT en el mismo bucket comercial, separa en líneas distintas.
 */
export function groupFinalPalletsForCommercialInvoice(
  fps: FinalPallet[],
  pricesByFormatId: Record<string, number>,
): CommercialInvoiceLineWithTrace[] {
  const m = new Map<
    string,
    {
      cajas: number;
      pounds: number;
      formatId: number | null;
      formatCode: string;
      varietyId: number | null;
      varietyName: string | null;
      speciesId: number | null;
      brandId: number | null;
      brandName: string | null;
      tarja_id: number | null;
      final_pallet_id: number | null;
      fruit_process_id: number | null;
      traceability_note: string | null;
    }
  >();

  for (const fp of fps) {
    const fid = fp.presentation_format_id != null ? Number(fp.presentation_format_id) : null;
    const fc = fp.presentation_format?.format_code?.trim() || '—';
    const bid = fp.brand_id != null && Number(fp.brand_id) > 0 ? Number(fp.brand_id) : null;
    const brandName = fp.brand?.nombre ?? null;

    for (const ln of fp.lines ?? []) {
      if (ln.amount <= 0) continue;
      const vid = ln.variety_id != null ? Number(ln.variety_id) : null;
      const vname = ln.variety?.nombre ?? null;
      const sid =
        ln.variety && (ln.variety as { species_id?: number }).species_id != null
          ? Number((ln.variety as { species_id: number }).species_id)
          : null;

      const { tarjaId, fruitProcessId, note } = resolveLineTrace(fp, ln);

      const traceKey =
        tarjaId != null
          ? `t:${tarjaId}`
          : `fp${fp.id}-pr${fruitProcessId != null ? fruitProcessId : `ln${ln.id}`}`;

      const key = `${fid ?? 'x'}|${vid ?? 'x'}|${bid ?? 'x'}|${traceKey}`;
      const lbs = Number(ln.pounds);
      const cur = m.get(key);
      const mergedNote =
        tarjaId != null ? null : note;

      if (cur) {
        cur.cajas += ln.amount;
        cur.pounds += lbs;
        if (!cur.traceability_note && mergedNote) cur.traceability_note = mergedNote;
      } else {
        m.set(key, {
          cajas: ln.amount,
          pounds: lbs,
          formatId: fid,
          formatCode: fc,
          varietyId: vid,
          varietyName: vname,
          speciesId: sid,
          brandId: bid,
          brandName,
          tarja_id: tarjaId,
          final_pallet_id: fp.id,
          fruit_process_id: fruitProcessId,
          traceability_note: mergedNote,
        });
      }
    }
  }

  const out: CommercialInvoiceLineWithTrace[] = [];
  for (const [, v] of m) {
    const pid = v.formatId != null ? String(v.formatId) : '';
    const unitPrice = pid ? Number(pricesByFormatId[pid] ?? 0) : 0;
    out.push({
      formatId: v.formatId,
      formatCode: v.formatCode,
      varietyId: v.varietyId,
      varietyName: v.varietyName,
      speciesId: v.speciesId,
      brandId: v.brandId,
      brandName: v.brandName,
      cajas: v.cajas,
      pounds: v.pounds,
      unitPrice,
      lineSubtotal: v.cajas * unitPrice,
      tarja_id: v.tarja_id,
      final_pallet_id: v.final_pallet_id,
      fruit_process_id: v.fruit_process_id,
      traceability_note: v.traceability_note,
    });
  }

  out.sort((a, b) => {
    const c = (a.formatCode || '').localeCompare(b.formatCode || '');
    if (c !== 0) return c;
    const v = (a.varietyName || '').localeCompare(b.varietyName || '');
    if (v !== 0) return v;
    const bn = (a.brandName || '').localeCompare(b.brandName || '');
    if (bn !== 0) return bn;
    const ta = a.tarja_id ?? 0;
    const tb = b.tarja_id ?? 0;
    if (ta !== tb) return ta - tb;
    return (a.final_pallet_id ?? 0) - (b.final_pallet_id ?? 0);
  });
  return out;
}

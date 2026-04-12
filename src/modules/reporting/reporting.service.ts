import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PlantService } from '../plant/plant.service';
import { ProcessService } from '../process/process.service';
import { ReportFilterDto, SaveReportDto, UpsertPackingCostDto } from './reporting.dto';
import { PackingCost, ReportSnapshot } from './reporting.entities';

type Paginated<T> = { rows: T[]; total: number; page: number; limit: number };

@Injectable()
export class ReportingService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ReportSnapshot) private readonly reportRepo: Repository<ReportSnapshot>,
    @InjectRepository(PackingCost) private readonly packingCostRepo: Repository<PackingCost>,
    private readonly plantService: PlantService,
    private readonly processService: ProcessService,
  ) {}

  /**
   * Filtro por día calendario inclusivo. Comparar timestamp con `'YYYY-MM-DD'` como medianoche
   * excluía despachos del mismo día después de 00:00; se usa (::date) en ambos lados.
   */
  private withDate(field: string, filter: ReportFilterDto) {
    const clauses: string[] = [];
    const fd = filter.fecha_desde?.trim();
    if (fd && /^\d{4}-\d{2}-\d{2}$/.test(fd)) {
      clauses.push(`(${field})::date >= '${fd}'::date`);
    }
    const fh = filter.fecha_hasta?.trim();
    if (fh && /^\d{4}-\d{2}-\d{2}$/.test(fh)) {
      clauses.push(`(${field})::date <= '${fh}'::date`);
    }
    return clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
  }

  private pageLimit(filter: ReportFilterDto) {
    const page = filter.page ?? 1;
    const limit = Math.min(filter.limit ?? 20, 100);
    return { page, limit, offset: (page - 1) * limit };
  }

  /** Solo > 0 cuenta como filtro; 0/"Todos" no debe excluir toda la liquidación. */
  private producerFilterId(filter: ReportFilterDto): number | null {
    const id = filter.productor_id;
    if (id == null) return null;
    const n = Number(id);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  private async loadTarjaProducerMaps(tarjaIds: number[]): Promise<{
    tagsByTarja: Map<number, { productor_id: number; cajas_generadas: number }[]>;
    fpByTarja: Map<number, number>;
  }> {
    const tagsByTarja = new Map<number, { productor_id: number; cajas_generadas: number }[]>();
    const fpByTarja = new Map<number, number>();
    const uniq = [...new Set(tarjaIds.map((x) => Number(x)).filter((x) => x > 0))];
    if (!uniq.length) return { tagsByTarja, fpByTarja };

    const tagRows = (await this.dataSource.query(
      `SELECT tarja_id, productor_id, cajas_generadas FROM pt_tag_items WHERE tarja_id = ANY($1::bigint[])`,
      [uniq],
    )) as Array<{ tarja_id: number; productor_id: number; cajas_generadas: number }>;
    for (const t of tagRows) {
      const arr = tagsByTarja.get(Number(t.tarja_id)) ?? [];
      arr.push({ productor_id: Number(t.productor_id), cajas_generadas: Number(t.cajas_generadas ?? 0) });
      tagsByTarja.set(Number(t.tarja_id), arr);
    }

    const missingTarjas = uniq.filter((tid) => (tagsByTarja.get(tid)?.length ?? 0) === 0);
    if (missingTarjas.length) {
      const fp = (await this.dataSource.query(
        `SELECT DISTINCT ON (tarja_id) tarja_id, productor_id
         FROM fruit_processes
         WHERE tarja_id = ANY($1::bigint[])
         ORDER BY tarja_id, id DESC`,
        [missingTarjas],
      )) as Array<{ tarja_id: number; productor_id: number }>;
      for (const r of fp) fpByTarja.set(Number(r.tarja_id), Number(r.productor_id));
    }
    return { tagsByTarja, fpByTarja };
  }

  /** Productor(es) y cajas por pallet final (suma por línea de pallet × proceso); sirve para mezcla de productores. */
  private async loadPalletProducerSlices(finalPalletIds: number[]): Promise<Map<number, { productor_id: number; cajas: number }[]>> {
    const m = new Map<number, { productor_id: number; cajas: number }[]>();
    const ids = [...new Set(finalPalletIds.map((x) => Number(x)).filter((x) => x > 0))];
    if (!ids.length) return m;
    const rows = (await this.dataSource.query(
      `
      SELECT fpl.final_pallet_id AS final_pallet_id, fp.productor_id AS productor_id,
             SUM(fpl.amount)::bigint AS cajas
      FROM final_pallet_lines fpl
      INNER JOIN fruit_processes fp ON fp.id = fpl.fruit_process_id AND fp.deleted_at IS NULL
      WHERE fpl.final_pallet_id = ANY($1::bigint[])
      GROUP BY fpl.final_pallet_id, fp.productor_id
      `,
      [ids],
    )) as Array<{ final_pallet_id: number; productor_id: number; cajas: string | number }>;
    for (const r of rows) {
      const fpid = Number(r.final_pallet_id);
      const arr = m.get(fpid) ?? [];
      arr.push({ productor_id: Number(r.productor_id), cajas: Number(r.cajas ?? 0) });
      m.set(fpid, arr);
    }
    return m;
  }

  /**
   * Cajas por productor desde repallet_line_provenance (pallet resultado de unión).
   * Resuelve proceso por fila de provenance o, si falta, por la línea origen guardada en source_line_id.
   */
  private async loadRepalletProvenanceProducerSlices(
    resultFinalPalletIds: number[],
  ): Promise<Map<number, { productor_id: number; cajas: number }[]>> {
    const m = new Map<number, { productor_id: number; cajas: number }[]>();
    const ids = [...new Set(resultFinalPalletIds.map((x) => Number(x)).filter((x) => x > 0))];
    if (!ids.length) return m;

    const rows = (await this.dataSource.query(
      `
      SELECT re.result_final_pallet_id AS result_pallet_id,
             rlp.fruit_process_id AS prov_process_id,
             rlp.source_line_id,
             rlp.boxes::bigint AS boxes
      FROM repallet_events re
      INNER JOIN repallet_line_provenance rlp ON rlp.event_id = re.id
      WHERE re.result_final_pallet_id = ANY($1::bigint[])
        AND re.reversed_at IS NULL
      `,
      [ids],
    )) as Array<{
      result_pallet_id: number;
      prov_process_id: number | null;
      source_line_id: number | null;
      boxes: string | number;
    }>;

    const lineIds = [
      ...new Set(rows.map((r) => r.source_line_id).filter((x): x is number => x != null && Number(x) > 0)),
    ];
    const processIdBySourceLineId = new Map<number, number | null>();
    if (lineIds.length) {
      const lineRows = (await this.dataSource.query(
        `SELECT id, fruit_process_id FROM final_pallet_lines WHERE id = ANY($1::bigint[])`,
        [lineIds],
      )) as Array<{ id: number; fruit_process_id: number | null }>;
      for (const lr of lineRows) {
        processIdBySourceLineId.set(
          Number(lr.id),
          lr.fruit_process_id != null && Number(lr.fruit_process_id) > 0 ? Number(lr.fruit_process_id) : null,
        );
      }
    }

    const resolveProcessId = (r: (typeof rows)[0]): number | null => {
      if (r.prov_process_id != null && Number(r.prov_process_id) > 0) return Number(r.prov_process_id);
      if (r.source_line_id != null) return processIdBySourceLineId.get(Number(r.source_line_id)) ?? null;
      return null;
    };

    const processIds = new Set<number>();
    for (const r of rows) {
      const pid = resolveProcessId(r);
      if (pid != null && pid > 0) processIds.add(pid);
    }
    const producerByProcess = new Map<number, number>();
    if (processIds.size) {
      const fpRows = (await this.dataSource.query(
        `SELECT id, productor_id FROM fruit_processes WHERE id = ANY($1::bigint[]) AND deleted_at IS NULL`,
        [[...processIds]],
      )) as Array<{ id: number; productor_id: number }>;
      for (const fr of fpRows) producerByProcess.set(Number(fr.id), Number(fr.productor_id));
    }

    type AggKey = string;
    const agg = new Map<AggKey, number>();
    for (const r of rows) {
      const procId = resolveProcessId(r);
      if (procId == null || procId <= 0) continue;
      const prodId = producerByProcess.get(procId);
      if (prodId == null) continue;
      const boxes = Number(r.boxes ?? 0);
      if (boxes <= 0) continue;
      const rk = Number(r.result_pallet_id);
      const key = `${rk}|${prodId}`;
      agg.set(key, (agg.get(key) ?? 0) + boxes);
    }

    for (const [key, cajas] of agg) {
      const [rkStr, prodStr] = key.split('|');
      const rk = Number(rkStr);
      const prod = Number(prodStr);
      const arr = m.get(rk) ?? [];
      arr.push({ productor_id: prod, cajas });
      m.set(rk, arr);
    }
    return m;
  }

  /**
   * Reparto de una línea de factura a productor(es): tarja → proceso en línea → líneas del pallet → procedencia de repallet.
   */
  private settlementSlicesForInvoiceLine(
    tarjaId: number | null,
    fruitProcessId: number | null,
    finalPalletId: number | null,
    tagsByTarja: Map<number, { productor_id: number; cajas_generadas: number }[]>,
    fpByTarja: Map<number, number>,
    producerByFruitProcessId: Map<number, number>,
    palletSlicesByFpId: Map<number, { productor_id: number; cajas: number }[]>,
    repalletSlicesByResultId: Map<number, { productor_id: number; cajas: number }[]>,
  ): {
    slices: Array<{ productor_id: number | null; frac: number }>;
    source:
      | 'pt_tag_items'
      | 'fruit_process_tarja'
      | 'invoice_fruit_process'
      | 'final_pallet_lines'
      | 'repallet_provenance'
      | 'none';
  } {
    type Slice = { productor_id: number | null; frac: number };
    if (tarjaId != null && Number(tarjaId) > 0) {
      const tags = tagsByTarja.get(Number(tarjaId));
      if (tags?.length) {
        const sum = tags.reduce((a, t) => a + Math.max(0, t.cajas_generadas), 0);
        if (sum > 0) {
          return {
            slices: tags.map((t) => ({
              productor_id: t.productor_id,
              frac: Math.max(0, t.cajas_generadas) / sum,
            })),
            source: 'pt_tag_items',
          };
        }
      }
      const pid = fpByTarja.get(Number(tarjaId));
      if (pid != null) return { slices: [{ productor_id: pid, frac: 1 }], source: 'fruit_process_tarja' };
    }
    if (fruitProcessId != null && Number(fruitProcessId) > 0) {
      const prod = producerByFruitProcessId.get(Number(fruitProcessId));
      if (prod != null) return { slices: [{ productor_id: prod, frac: 1 }], source: 'invoice_fruit_process' };
    }
    const fp = finalPalletId != null && Number(finalPalletId) > 0 ? Number(finalPalletId) : null;
    if (fp != null) {
      const parts = palletSlicesByFpId.get(fp)?.filter((p) => p.cajas > 0);
      if (parts?.length) {
        const sum = parts.reduce((a, p) => a + p.cajas, 0);
        if (sum > 0) {
          return {
            slices: parts.map((p) => ({ productor_id: p.productor_id, frac: p.cajas / sum })),
            source: 'final_pallet_lines',
          };
        }
      }
      const rparts = repalletSlicesByResultId.get(fp)?.filter((p) => p.cajas > 0);
      if (rparts?.length) {
        const sumR = rparts.reduce((a, p) => a + p.cajas, 0);
        if (sumR > 0) {
          return {
            slices: rparts.map((p) => ({ productor_id: p.productor_id, frac: p.cajas / sumR })),
            source: 'repallet_provenance',
          };
        }
      }
    }
    return { slices: [{ productor_id: null, frac: 1 }], source: 'none' };
  }

  private async paginateQuery<T extends Record<string, unknown>>(
    sql: string,
    countSql: string,
    filter: ReportFilterDto,
  ): Promise<Paginated<T>> {
    const { page, limit, offset } = this.pageLimit(filter);
    const totalRow = await this.dataSource.query(countSql);
    const first = totalRow[0] as Record<string, unknown> | undefined;
    const total = Number(first?.c ?? first?.count ?? Object.values(first || {})[0] ?? 0);
    const rows = await this.dataSource.query(`${sql} LIMIT ${limit} OFFSET ${offset}`);
    return { rows, total, page, limit };
  }

  private paginateRows<T extends Record<string, unknown>>(rows: T[], filter: ReportFilterDto): Paginated<T> {
    const { page, limit, offset } = this.pageLimit(filter);
    return { rows: rows.slice(offset, offset + limit), total: rows.length, page, limit };
  }

  /** Costo total por formato en el período (mismo origen que liquidación / costo por formato en pantalla). */
  private costMapFromFormatSummary(
    summaryRows: Record<string, unknown>[],
  ): Map<string, { costo_materiales: number; costo_packing: number; costo_total: number; cajas_periodo: number }> {
    const costByFormat = new Map<
      string,
      { costo_materiales: number; costo_packing: number; costo_total: number; cajas_periodo: number }
    >();
    for (const row of summaryRows) {
      const fk = String((row as { format_code?: string }).format_code ?? '')
        .trim()
        .toLowerCase();
      if (!fk) continue;
      costByFormat.set(fk, {
        costo_materiales: Number((row as { costo_materiales?: number }).costo_materiales ?? 0),
        costo_packing: Number((row as { costo_packing?: number }).costo_packing ?? 0),
        costo_total: Number((row as { costo_total?: number }).costo_total ?? 0),
        cajas_periodo: Number((row as { cajas?: number }).cajas ?? 0),
      });
    }
    return costByFormat;
  }

  /** Ajustes operativos explícitos para materiales que deben computar siempre como directo/caja. */
  private classifyRecipeLine(
    materialName: string,
    base: 'box' | 'pallet',
    tipo: 'directo' | 'tripaje',
  ): { base: 'box' | 'pallet'; tipo: 'directo' | 'tripaje'; forced: boolean } {
    const n = materialName.trim().toLowerCase();
    if (n === 'label clamshell' || n === 'label 4x2 case') {
      return { base: 'box', tipo: 'directo', forced: true };
    }
    return { base, tipo, forced: false };
  }

  /** Cálculo interno completo (sin paginar); reutilizado por liquidación por productor y export PDF. */
  async computeFormatCostingRows(filter: ReportFilterDto): Promise<{
    precio_packing_por_lb: number | null;
    packing_source: 'manual_filter' | 'packing_costs_by_species';
    summaryRows: Record<string, unknown>[];
    linesRows: Record<string, unknown>[];
  }> {
    const manualPacking = filter.precio_packing_por_lb != null ? Number(filter.precio_packing_por_lb) : null;
    const formatCode = filter.format_code?.trim();
    const formatWhere = formatCode ? `AND LOWER(TRIM(pf.format_code)) = LOWER(TRIM($1))` : '';
    const recipes = (await this.dataSource.query(
      `
      SELECT r.id, r.descripcion, pf.format_code, pf.species_id, s.nombre AS species_name
      FROM packaging_recipes r
      JOIN presentation_formats pf ON pf.id = r.presentation_format_id
      LEFT JOIN species s ON s.id = pf.species_id
      WHERE r.activo = TRUE ${formatWhere}
      ORDER BY pf.format_code
      `,
      formatCode ? [formatCode] : [],
    )) as Array<{ id: number; format_code: string; descripcion: string | null; species_id: number | null; species_name: string | null }>;

    const recipeIds = recipes.map((r) => Number(r.id));
    if (!recipeIds.length) {
      return {
        precio_packing_por_lb: manualPacking != null && Number.isFinite(manualPacking) ? Number(manualPacking.toFixed(4)) : null,
        packing_source: manualPacking != null && Number.isFinite(manualPacking) ? 'manual_filter' : 'packing_costs_by_species',
        summaryRows: [],
        linesRows: [],
      };
    }

    const packingCosts = await this.packingCostRepo.find({
      where: { active: true },
      order: { id: 'DESC' },
    });
    const packingBySpecies = new Map<number, number>();
    for (const pc of packingCosts) {
      const sid = Number(pc.species_id);
      if (sid > 0 && !packingBySpecies.has(sid)) {
        if (!pc.season || pc.season.trim() === '') {
          packingBySpecies.set(sid, Number(pc.price_per_lb));
        }
      }
    }

    const items = (await this.dataSource.query(
      `
      SELECT i.id, i.recipe_id, i.material_id, i.qty_per_unit, i.base_unidad, i.cost_type,
             m.nombre_material, m.unidad_medida, m.costo_unitario
      FROM packaging_recipe_items i
      JOIN packaging_materials m ON m.id = i.material_id
      WHERE i.recipe_id = ANY($1::bigint[])
      ORDER BY i.recipe_id ASC, i.id ASC
      `,
      [recipeIds],
    )) as Array<{
      id: number;
      recipe_id: number;
      material_id: number;
      qty_per_unit: string;
      base_unidad: 'box' | 'pallet' | null;
      cost_type: 'directo' | 'tripaje' | null;
      nombre_material: string;
      unidad_medida: string;
      costo_unitario: string;
    }>;

    const formats = (await this.dataSource.query(
      `
      SELECT LOWER(TRIM(format_code)) AS format_key, max_boxes_per_pallet
      FROM presentation_formats
      `,
    )) as Array<{ format_key: string; max_boxes_per_pallet: number | null }>;
    const formatMeta = new Map<string, { max_boxes_per_pallet: number | null }>(
      formats.map((f) => [String(f.format_key), { max_boxes_per_pallet: f.max_boxes_per_pallet ?? null }]),
    );

    const invoiceAgg = (await this.dataSource.query(
      `
      SELECT
        LOWER(TRIM(ii.packaging_code)) AS format_key,
        COALESCE(SUM(ii.cajas), 0)::numeric AS cajas,
        COALESCE(
          SUM(
            CASE
              WHEN ii.pounds IS NULL THEN 0
              WHEN BTRIM(ii.pounds::text) = '' THEN 0
              WHEN BTRIM(ii.pounds::text) ~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$' THEN BTRIM(ii.pounds::text)::numeric
              ELSE 0
            END
          ),
          0
        )::numeric AS lb_totales,
        CASE
          WHEN COALESCE(SUM(ii.cajas), 0) > 0
          THEN (SUM(ii.cajas * ii.unit_price::numeric) / SUM(ii.cajas))::numeric
          ELSE NULL
        END AS precio_cliente
      FROM invoice_items ii
      JOIN invoices inv ON inv.id = ii.invoice_id
      JOIN dispatches d ON d.id = inv.dispatch_id
      WHERE ii.packaging_code IS NOT NULL
        AND BTRIM(ii.packaging_code) <> ''
        ${this.withDate('d.fecha_despacho', filter)}
      GROUP BY LOWER(TRIM(ii.packaging_code))
      `,
    )) as Array<{ format_key: string; cajas: string; lb_totales: string; precio_cliente: string | null }>;
    const aggByFormat = new Map<string, { cajas: number; lb_totales: number; precio_cliente: number | null }>(
      invoiceAgg.map((r) => [
        String(r.format_key),
        {
          cajas: Number(r.cajas ?? 0),
          lb_totales: Number(r.lb_totales ?? 0),
          precio_cliente: r.precio_cliente == null ? null : Number(r.precio_cliente),
        },
      ]),
    );

    const linesRows: Record<string, unknown>[] = [];
    const summaryRows: Record<string, unknown>[] = [];

    for (const recipe of recipes) {
      const formatKey = recipe.format_code.trim().toLowerCase();
      const agg = aggByFormat.get(formatKey) ?? { cajas: 0, lb_totales: 0, precio_cliente: null };
      const cajasPorPallet = Number(formatMeta.get(formatKey)?.max_boxes_per_pallet ?? 0);
      const recipeItems = items.filter((x) => Number(x.recipe_id) === Number(recipe.id));
      /** `species_id` viene del formato de presentación (JOIN); sin él no hay precio por lb en packing_costs. */
      const autoPacking = recipe.species_id != null ? Number(packingBySpecies.get(Number(recipe.species_id)) ?? 0) : 0;
      const pricePacking = manualPacking != null && Number.isFinite(manualPacking) ? manualPacking : autoPacking;

      let totalDirecto = 0;
      let totalTripaje = 0;
      let missingBoxesPerPallet = false;

      for (const it of recipeItems) {
        const qtyReceta = Number(it.qty_per_unit ?? 0);
        const baseRaw = (it.base_unidad ?? 'box') as 'box' | 'pallet';
        const tipoRaw = (it.cost_type ?? 'directo') as 'directo' | 'tripaje';
        const cls = this.classifyRecipeLine(it.nombre_material, baseRaw, tipoRaw);
        const base = cls.base;
        const tipo = cls.tipo;
        const hasPalletBaseWithoutBoxes = base === 'pallet' && !(cajasPorPallet > 0);
        if (hasPalletBaseWithoutBoxes) missingBoxesPerPallet = true;
        const factorPorCaja = base === 'pallet' ? (cajasPorPallet > 0 ? qtyReceta / cajasPorPallet : 0) : qtyReceta;
        const consumoTotal = agg.cajas * factorPorCaja;
        const unitCost = Number(it.costo_unitario ?? 0);
        const costoTotal = consumoTotal * unitCost;
        if (tipo === 'tripaje') totalTripaje += costoTotal;
        else totalDirecto += costoTotal;
        linesRows.push({
          format_code: recipe.format_code,
          material: it.nombre_material,
          tipo,
          base_unidad: base,
          cantidad_receta: qtyReceta,
          factor_por_caja: Number(factorPorCaja.toFixed(6)),
          consumo_total: Number(consumoTotal.toFixed(4)),
          costo_unitario: Number(unitCost.toFixed(4)),
          costo_total: Number(costoTotal.toFixed(2)),
          unidad_medida: it.unidad_medida,
          classification_override:
            cls.forced ? 'Forzado a directo/caja por regla operativa (label clamshell / label 4x2 case).' : null,
          warning:
            hasPalletBaseWithoutBoxes
              ? 'Línea base pallet sin cajas_por_pallet configurado en el formato; factor por caja calculado como 0.'
              : null,
        });
      }

      const subtotalMateriales = totalDirecto + totalTripaje;
      const costoPacking = agg.lb_totales * pricePacking;
      const costoTotal = subtotalMateriales + costoPacking;
      const costoPorCaja = agg.cajas > 0 ? costoTotal / agg.cajas : 0;
      const costoPorLb = agg.lb_totales > 0 ? costoTotal / agg.lb_totales : 0;
      const deltaPorCaja = agg.precio_cliente != null ? agg.precio_cliente - costoPorCaja : null;
      const margenTotal = agg.precio_cliente != null ? agg.precio_cliente * agg.cajas - costoTotal : null;

      summaryRows.push({
        format_code: recipe.format_code,
        species_id: recipe.species_id != null ? Number(recipe.species_id) : null,
        species_name: recipe.species_name ?? null,
        descripcion: recipe.descripcion ?? null,
        cajas: Number(agg.cajas.toFixed(2)),
        lb: Number(agg.lb_totales.toFixed(3)),
        lb_totales: Number(agg.lb_totales.toFixed(3)),
        cajas_por_pallet: cajasPorPallet > 0 ? cajasPorPallet : null,
        precio_packing_por_lb: Number(pricePacking.toFixed(4)),
        total_directo: Number(totalDirecto.toFixed(2)),
        total_tripaje: Number(totalTripaje.toFixed(2)),
        costo_materiales: Number(subtotalMateriales.toFixed(2)),
        subtotal_materiales: Number(subtotalMateriales.toFixed(2)),
        costo_packing: Number(costoPacking.toFixed(2)),
        costo_total: Number(costoTotal.toFixed(2)),
        costo_por_caja: Number(costoPorCaja.toFixed(4)),
        costo_por_lb: Number(costoPorLb.toFixed(6)),
        precio_cliente: agg.precio_cliente != null ? Number(agg.precio_cliente.toFixed(4)) : null,
        delta_por_caja: deltaPorCaja != null ? Number(deltaPorCaja.toFixed(4)) : null,
        margen_total: margenTotal != null ? Number(margenTotal.toFixed(2)) : null,
        warning:
          missingBoxesPerPallet
            ? 'Hay líneas base pallet sin cajas_por_pallet en presentation_formats; revisá maestro de formatos.'
            : null,
      });
    }

    return {
      precio_packing_por_lb: manualPacking != null && Number.isFinite(manualPacking) ? Number(manualPacking.toFixed(4)) : null,
      packing_source: manualPacking != null && Number.isFinite(manualPacking) ? 'manual_filter' : 'packing_costs_by_species',
      summaryRows,
      linesRows,
    };
  }

  private async buildFormatCosting(filter: ReportFilterDto) {
    const inner = await this.computeFormatCostingRows(filter);
    return {
      precio_packing_por_lb: inner.precio_packing_por_lb,
      packing_source: inner.packing_source,
      summary: this.paginateRows(inner.summaryRows, filter),
      lines: this.paginateRows(inner.linesRows, filter),
    };
  }

  /**
   * Filas completas de liquidación (sin paginar). Misma lógica que la vista en pantalla.
   */
  async computeProducerSettlementRows(
    filter: ReportFilterDto,
    formatInner?: {
      precio_packing_por_lb: number | null;
      packing_source: 'manual_filter' | 'packing_costs_by_species';
      summaryRows: Record<string, unknown>[];
      linesRows: Record<string, unknown>[];
    },
  ): Promise<{ summaryRows: Record<string, unknown>[]; detailRows: Record<string, unknown>[] }> {
    const inner = formatInner ?? (await this.computeFormatCostingRows(filter));
    const costByFormat = this.costMapFromFormatSummary(inner.summaryRows);

    const lines = (await this.dataSource.query(
      `
      SELECT
        ii.id AS line_id,
        ii.invoice_id,
        d.id AS dispatch_id,
        ii.tarja_id,
        ii.fruit_process_id,
        ii.final_pallet_id,
        COALESCE(ii.cajas, 0)::numeric AS cajas,
        ii.line_subtotal::numeric AS line_subtotal,
        ii.packaging_code,
        CASE
          WHEN ii.pounds IS NULL THEN 0::numeric
          WHEN BTRIM(ii.pounds::text) = '' THEN 0::numeric
          WHEN BTRIM(ii.pounds::text) ~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$' THEN BTRIM(ii.pounds::text)::numeric
          ELSE 0::numeric
        END AS lb_line
      FROM invoice_items ii
      JOIN invoices inv ON inv.id = ii.invoice_id
      JOIN dispatches d ON d.id = inv.dispatch_id
      WHERE 1=1 ${this.withDate('d.fecha_despacho', filter)}
      ORDER BY d.id, ii.id
      `,
    )) as Array<{
      line_id: number;
      invoice_id: number;
      dispatch_id: number;
      tarja_id: number | null;
      fruit_process_id: number | null;
      final_pallet_id: number | null;
      cajas: string;
      line_subtotal: string;
      packaging_code: string | null;
      lb_line: string;
    }>;

    const tarjaIds = [...new Set(lines.map((l) => l.tarja_id).filter((x): x is number => x != null && Number(x) > 0))];
    const { tagsByTarja, fpByTarja } = await this.loadTarjaProducerMaps(tarjaIds);
    const fruitProcessIds = [
      ...new Set(lines.map((l) => l.fruit_process_id).filter((x): x is number => x != null && Number(x) > 0)),
    ];
    const producerByFruitProcessId = new Map<number, number>();
    if (fruitProcessIds.length) {
      const fpRows = (await this.dataSource.query(
        `SELECT id, productor_id FROM fruit_processes WHERE id = ANY($1::bigint[]) AND deleted_at IS NULL`,
        [fruitProcessIds],
      )) as Array<{ id: number; productor_id: number }>;
      for (const r of fpRows) producerByFruitProcessId.set(Number(r.id), Number(r.productor_id));
    }
    const fpIdsForPallet = [
      ...new Set(lines.map((l) => l.final_pallet_id).filter((x): x is number => x != null && Number(x) > 0)),
    ];
    const palletSlicesByFpId = await this.loadPalletProducerSlices(fpIdsForPallet);
    const repalletSlicesByResultId = await this.loadRepalletProvenanceProducerSlices(fpIdsForPallet);
    const prodFilter = this.producerFilterId(filter);

    const byProdFormat = new Map<
      string,
      { productor_id: number | null; format_key: string | null; cajas: number; lb: number; ventas: number }
    >();
    const byProd = new Map<number | null, { cajas: number; lb: number; ventas: number }>();

    const bump = (
      productor_id: number | null,
      format_key: string | null,
      cajas: number,
      lb: number,
      ventas: number,
    ) => {
      const pk = `${productor_id ?? 'null'}|${format_key ?? ''}`;
      const cur = byProdFormat.get(pk) ?? { productor_id, format_key, cajas: 0, lb: 0, ventas: 0 };
      cur.cajas += cajas;
      cur.lb += lb;
      cur.ventas += ventas;
      byProdFormat.set(pk, cur);
      const pcur = byProd.get(productor_id) ?? { cajas: 0, lb: 0, ventas: 0 };
      pcur.cajas += cajas;
      pcur.lb += lb;
      pcur.ventas += ventas;
      byProd.set(productor_id, pcur);
    };

    for (const li of lines) {
      const cajas = Number(li.cajas ?? 0);
      const lbLine = Number(li.lb_line ?? 0);
      const ventas = Number(li.line_subtotal ?? 0);
      const fmt = li.packaging_code?.trim() ? li.packaging_code.trim().toLowerCase() : null;
      const { slices } = this.settlementSlicesForInvoiceLine(
        li.tarja_id != null && Number(li.tarja_id) > 0 ? Number(li.tarja_id) : null,
        li.fruit_process_id != null && Number(li.fruit_process_id) > 0 ? Number(li.fruit_process_id) : null,
        li.final_pallet_id != null && Number(li.final_pallet_id) > 0 ? Number(li.final_pallet_id) : null,
        tagsByTarja,
        fpByTarja,
        producerByFruitProcessId,
        palletSlicesByFpId,
        repalletSlicesByResultId,
      );
      for (const s of slices) {
        if (prodFilter != null && s.productor_id != null && Number(s.productor_id) !== prodFilter) {
          continue;
        }
        if (prodFilter != null && s.productor_id == null) continue;
        bump(s.productor_id, fmt, cajas * s.frac, lbLine * s.frac, ventas * s.frac);
      }
    }

    const applyCost = (pid: number | null) => {
      let cm = 0;
      let cp = 0;
      let ct = 0;
      for (const [pk, agg] of byProdFormat) {
        if (agg.productor_id !== pid) continue;
        const fk = agg.format_key;
        if (!fk) continue;
        const c = costByFormat.get(fk);
        if (!c || c.cajas_periodo <= 0) continue;
        const share = agg.cajas / c.cajas_periodo;
        if (share <= 0) continue;
        cm += c.costo_materiales * share;
        cp += c.costo_packing * share;
        ct += c.costo_total * share;
      }
      return { costo_materiales: cm, costo_packing: cp, costo_total: ct };
    };

    const producerIds = [...new Set([...byProd.keys()].filter((x): x is number => x != null))];
    const names =
      producerIds.length > 0
        ? ((await this.dataSource.query(`SELECT id, nombre FROM producers WHERE id = ANY($1::bigint[])`, [producerIds])) as Array<{
            id: number;
            nombre: string;
          }>)
        : [];
    const nameById = new Map(names.map((n) => [Number(n.id), n.nombre]));

    const summaryRows: Record<string, unknown>[] = [];
    for (const [pid, agg] of byProd) {
      if (pid == null) {
        const costs = applyCost(null);
        const neto = agg.ventas - costs.costo_total;
        summaryRows.push({
          productor_id: null,
          productor_nombre: '(sin unidad PT / sin asignar)',
          cajas: Number(agg.cajas.toFixed(4)),
          lb: Number(agg.lb.toFixed(4)),
          ventas: Number(agg.ventas.toFixed(2)),
          costo_materiales: Number(costs.costo_materiales.toFixed(2)),
          costo_packing: Number(costs.costo_packing.toFixed(2)),
          costo_total: Number(costs.costo_total.toFixed(2)),
          neto_productor: Number(neto.toFixed(2)),
        });
        continue;
      }
      const costs = applyCost(pid);
      const neto = agg.ventas - costs.costo_total;
      summaryRows.push({
        productor_id: pid,
        productor_nombre: nameById.get(pid) ?? null,
        cajas: Number(agg.cajas.toFixed(4)),
        lb: Number(agg.lb.toFixed(4)),
        ventas: Number(agg.ventas.toFixed(2)),
        costo_materiales: Number(costs.costo_materiales.toFixed(2)),
        costo_packing: Number(costs.costo_packing.toFixed(2)),
        costo_total: Number(costs.costo_total.toFixed(2)),
        neto_productor: Number(neto.toFixed(2)),
      });
    }
    summaryRows.sort((a, b) => {
      const na = a.productor_id == null ? 1 : 0;
      const nb = b.productor_id == null ? 1 : 0;
      if (na !== nb) return na - nb;
      return Number(a.productor_id ?? 0) - Number(b.productor_id ?? 0);
    });

    const detailRows: Record<string, unknown>[] = [];
    const byProdDispatchFormat = new Map<
      string,
      { productor_id: number | null; dispatch_id: number; format_key: string | null; cajas: number; lb: number; ventas: number }
    >();

    for (const li of lines) {
      const cajas = Number(li.cajas ?? 0);
      const lbLine = Number(li.lb_line ?? 0);
      const ventas = Number(li.line_subtotal ?? 0);
      const fmt = li.packaging_code?.trim() ? li.packaging_code.trim().toLowerCase() : null;
      const { slices } = this.settlementSlicesForInvoiceLine(
        li.tarja_id != null && Number(li.tarja_id) > 0 ? Number(li.tarja_id) : null,
        li.fruit_process_id != null && Number(li.fruit_process_id) > 0 ? Number(li.fruit_process_id) : null,
        li.final_pallet_id != null && Number(li.final_pallet_id) > 0 ? Number(li.final_pallet_id) : null,
        tagsByTarja,
        fpByTarja,
        producerByFruitProcessId,
        palletSlicesByFpId,
        repalletSlicesByResultId,
      );
      for (const s of slices) {
        if (prodFilter != null && s.productor_id != null && Number(s.productor_id) !== prodFilter) {
          continue;
        }
        if (prodFilter != null && s.productor_id == null) continue;
        const dk = `${s.productor_id ?? 'null'}|${li.dispatch_id}|${fmt ?? ''}`;
        const cur = byProdDispatchFormat.get(dk) ?? {
          productor_id: s.productor_id,
          dispatch_id: li.dispatch_id,
          format_key: fmt,
          cajas: 0,
          lb: 0,
          ventas: 0,
        };
        cur.cajas += cajas * s.frac;
        cur.lb += lbLine * s.frac;
        cur.ventas += ventas * s.frac;
        byProdDispatchFormat.set(dk, cur);
      }
    }

    for (const agg of byProdDispatchFormat.values()) {
      const fk = agg.format_key;
      const c = fk ? costByFormat.get(fk) : undefined;
      const share =
        fk && c && c.cajas_periodo > 0 ? Math.min(1, Math.max(0, agg.cajas / c.cajas_periodo)) : 0;
      const costo_materiales = fk && c && c.cajas_periodo > 0 ? c.costo_materiales * share : 0;
      const costo_packing = fk && c && c.cajas_periodo > 0 ? c.costo_packing * share : 0;
      const costo_total = fk && c && c.cajas_periodo > 0 ? c.costo_total * share : 0;
      detailRows.push({
        productor_id: agg.productor_id,
        productor_nombre: agg.productor_id != null ? nameById.get(agg.productor_id) ?? null : '(sin unidad PT / sin asignar)',
        dispatch_id: agg.dispatch_id,
        format_code: agg.format_key,
        cajas: Number(agg.cajas.toFixed(4)),
        lb: Number(agg.lb.toFixed(4)),
        ventas: Number(agg.ventas.toFixed(2)),
        costo_materiales: Number(costo_materiales.toFixed(2)),
        costo_packing: Number(costo_packing.toFixed(2)),
        costo_total: Number(costo_total.toFixed(2)),
        neto: Number((agg.ventas - costo_total).toFixed(2)),
        nota_prorrateo:
          fk && c && c.cajas_periodo > 0
            ? `Costos del formato prorrateados por cajas del productor / cajas totales del formato en el período (${agg.cajas.toFixed(2)} / ${c.cajas_periodo.toFixed(2)}).`
            : fk
              ? 'Sin receta/costo por formato para este código en el período.'
              : 'Línea sin packaging_code; solo ventas (sin costo por formato).',
      });
    }
    detailRows.sort((a, b) => {
      const da = Number(a.dispatch_id);
      const db = Number(b.dispatch_id);
      if (da !== db) return da - db;
      const pa = a.productor_id == null ? 999999999 : Number(a.productor_id);
      const pb = b.productor_id == null ? 999999999 : Number(b.productor_id);
      if (pa !== pb) return pa - pb;
      return String(a.format_code ?? '').localeCompare(String(b.format_code ?? ''));
    });

    return { summaryRows, detailRows };
  }

  /**
   * Margen por cliente (financiero interno): reutiliza `costMapFromFormatSummary` (mismo origen que costo por formato)
   * y prorratea costos con `cajas_cliente_en_formato / cajas_totales_formato_en_periodo`, sin reparto por productor.
   */
  private async computeClientMarginRows(
    filter: ReportFilterDto,
    formatInner: {
      precio_packing_por_lb: number | null;
      packing_source: 'manual_filter' | 'packing_costs_by_species';
      summaryRows: Record<string, unknown>[];
      linesRows: Record<string, unknown>[];
    },
  ): Promise<{ summaryRows: Record<string, unknown>[]; detailRows: Record<string, unknown>[] }> {
    const costByFormat = this.costMapFromFormatSummary(formatInner.summaryRows);

    const cid = filter.cliente_id != null && Number(filter.cliente_id) > 0 ? Number(filter.cliente_id) : null;
    const clientClause = cid != null ? ` AND d.cliente_id = ${cid}` : '';
    const fc = filter.format_code?.trim();
    const formatLineClause = fc
      ? ` AND LOWER(TRIM(ii.packaging_code)) = LOWER(TRIM('${fc.replace(/'/g, "''")}'))`
      : '';

    const lines = (await this.dataSource.query(
      `
      SELECT
        d.cliente_id,
        COALESCE(ii.cajas, 0)::numeric AS cajas,
        ii.line_subtotal::numeric AS line_subtotal,
        ii.packaging_code,
        CASE
          WHEN ii.pounds IS NULL THEN 0::numeric
          WHEN BTRIM(ii.pounds::text) = '' THEN 0::numeric
          WHEN BTRIM(ii.pounds::text) ~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$' THEN BTRIM(ii.pounds::text)::numeric
          ELSE 0::numeric
        END AS lb_line
      FROM invoice_items ii
      JOIN invoices inv ON inv.id = ii.invoice_id
      JOIN dispatches d ON d.id = inv.dispatch_id
      WHERE 1=1 ${this.withDate('d.fecha_despacho', filter)}${clientClause}${formatLineClause}
      ORDER BY d.cliente_id, ii.id
      `,
    )) as Array<{
      cliente_id: number;
      cajas: string;
      line_subtotal: string;
      packaging_code: string | null;
      lb_line: string;
    }>;

    const byClientFormat = new Map<
      string,
      { cliente_id: number; format_key: string | null; cajas: number; lb: number; ventas: number }
    >();
    const byClient = new Map<number, { cajas: number; lb: number; ventas: number }>();

    for (const li of lines) {
      const clienteId = Number(li.cliente_id ?? 0);
      const cajas = Number(li.cajas ?? 0);
      const lbLine = Number(li.lb_line ?? 0);
      const ventas = Number(li.line_subtotal ?? 0);
      const fmt = li.packaging_code?.trim() ? li.packaging_code.trim().toLowerCase() : null;
      const pk = `${clienteId}|${fmt ?? ''}`;
      const cur = byClientFormat.get(pk) ?? { cliente_id: clienteId, format_key: fmt, cajas: 0, lb: 0, ventas: 0 };
      cur.cajas += cajas;
      cur.lb += lbLine;
      cur.ventas += ventas;
      byClientFormat.set(pk, cur);
      const pcur = byClient.get(clienteId) ?? { cajas: 0, lb: 0, ventas: 0 };
      pcur.cajas += cajas;
      pcur.lb += lbLine;
      pcur.ventas += ventas;
      byClient.set(clienteId, pcur);
    }

    const applyCost = (clienteId: number) => {
      let cm = 0;
      let cp = 0;
      let ct = 0;
      for (const agg of byClientFormat.values()) {
        if (agg.cliente_id !== clienteId) continue;
        const fk = agg.format_key;
        if (!fk) continue;
        const c = costByFormat.get(fk);
        if (!c || c.cajas_periodo <= 0) continue;
        const share = agg.cajas / c.cajas_periodo;
        if (share <= 0) continue;
        cm += c.costo_materiales * share;
        cp += c.costo_packing * share;
        ct += c.costo_total * share;
      }
      return { costo_materiales: cm, costo_packing: cp, costo_total: ct };
    };

    const clientIds = [...byClient.keys()].sort((a, b) => a - b);
    const names =
      clientIds.length > 0
        ? ((await this.dataSource.query(`SELECT id, nombre FROM clients WHERE id = ANY($1::bigint[])`, [clientIds])) as Array<{
            id: number;
            nombre: string;
          }>)
        : [];
    const nameById = new Map(names.map((n) => [Number(n.id), n.nombre]));

    const summaryRows: Record<string, unknown>[] = [];
    for (const clienteId of clientIds) {
      const agg = byClient.get(clienteId)!;
      const costs = applyCost(clienteId);
      const margen = agg.ventas - costs.costo_total;
      summaryRows.push({
        cliente_id: clienteId,
        cliente_nombre: nameById.get(clienteId) ?? null,
        total_cajas: Number(agg.cajas.toFixed(4)),
        total_lb: Number(agg.lb.toFixed(4)),
        total_ventas: Number(agg.ventas.toFixed(2)),
        costo_materiales: Number(costs.costo_materiales.toFixed(2)),
        costo_packing: Number(costs.costo_packing.toFixed(2)),
        costo_total: Number(costs.costo_total.toFixed(2)),
        margen: Number(margen.toFixed(2)),
        margen_por_caja: Number((agg.cajas > 0 ? margen / agg.cajas : 0).toFixed(6)),
        margen_por_lb: Number((agg.lb > 0 ? margen / agg.lb : 0).toFixed(6)),
      });
    }

    const detailRows: Record<string, unknown>[] = [];
    for (const agg of byClientFormat.values()) {
      const fk = agg.format_key;
      const c = fk ? costByFormat.get(fk) : undefined;
      const share = fk && c && c.cajas_periodo > 0 ? Math.min(1, Math.max(0, agg.cajas / c.cajas_periodo)) : 0;
      const costo_materiales = fk && c && c.cajas_periodo > 0 ? c.costo_materiales * share : 0;
      const costo_packing = fk && c && c.cajas_periodo > 0 ? c.costo_packing * share : 0;
      const costo_total = fk && c && c.cajas_periodo > 0 ? c.costo_total * share : 0;
      const margen = agg.ventas - costo_total;
      detailRows.push({
        cliente_id: agg.cliente_id,
        cliente_nombre: nameById.get(agg.cliente_id) ?? null,
        format_code: fk,
        total_cajas: Number(agg.cajas.toFixed(4)),
        total_lb: Number(agg.lb.toFixed(4)),
        total_ventas: Number(agg.ventas.toFixed(2)),
        costo_materiales: Number(costo_materiales.toFixed(2)),
        costo_packing: Number(costo_packing.toFixed(2)),
        costo_total: Number(costo_total.toFixed(2)),
        margen: Number(margen.toFixed(2)),
        margen_por_caja: Number((agg.cajas > 0 ? margen / agg.cajas : 0).toFixed(6)),
        margen_por_lb: Number((agg.lb > 0 ? margen / agg.lb : 0).toFixed(6)),
        nota_prorrateo:
          fk && c && c.cajas_periodo > 0
            ? `Costos del formato prorrateados por cajas del cliente / cajas totales del formato en el período (${agg.cajas.toFixed(2)} / ${c.cajas_periodo.toFixed(2)}).`
            : fk
              ? 'Sin receta/costo por formato para este código en el período.'
              : 'Línea sin packaging_code; solo ventas (sin costo por formato).',
      });
    }
    detailRows.sort((a, b) => {
      const ca = Number(a.cliente_id);
      const cb = Number(b.cliente_id);
      if (ca !== cb) return ca - cb;
      return String(a.format_code ?? '').localeCompare(String(b.format_code ?? ''));
    });

    return { summaryRows, detailRows };
  }

  /**
   * Liquidación económica por productor: reutiliza costos por formato (computeFormatCostingRows)
   * y prorratea por participación en cajas por formato/tarja en facturación.
   */
  private async buildProducerSettlement(
    filter: ReportFilterDto,
    formatInner?: {
      precio_packing_por_lb: number | null;
      packing_source: 'manual_filter' | 'packing_costs_by_species';
      summaryRows: Record<string, unknown>[];
      linesRows: Record<string, unknown>[];
    },
  ) {
    const { summaryRows, detailRows } = await this.computeProducerSettlementRows(filter, formatInner);
    return {
      producerSettlementSummary: this.paginateRows(summaryRows, filter),
      producerSettlementDetail: this.paginateRows(detailRows, filter),
    };
  }

  private describeDateFilter(field: string, filter: ReportFilterDto): string {
    const parts: string[] = [];
    const fd = filter.fecha_desde?.trim();
    const fh = filter.fecha_hasta?.trim();
    if (fd && /^\d{4}-\d{2}-\d{2}$/.test(fd)) parts.push(`(${field})::date >= '${fd}'::date`);
    if (fh && /^\d{4}-\d{2}-\d{2}$/.test(fh)) parts.push(`(${field})::date <= '${fh}'::date`);
    return parts.length ? parts.join(' AND ') : '(sin filtro de fecha: se incluyen todos los despachos con factura)';
  }

  /** Diagnóstico temporal: trazabilidad tarja → productor y motivos si la liquidación queda vacía. */
  async producerSettlementDiagnostic(filter: ReportFilterDto) {
    const prodFilter = this.producerFilterId(filter);
    const dateClause = this.describeDateFilter('d.fecha_despacho', filter);

    const dispatches = (await this.dataSource.query(
      `
      SELECT d.id AS dispatch_id,
             d.fecha_despacho::text AS fecha_despacho,
             i.id AS invoice_id,
             i.invoice_number
      FROM dispatches d
      LEFT JOIN invoices i ON i.dispatch_id = d.id
      WHERE 1=1 ${this.withDate('d.fecha_despacho', filter)}
      ORDER BY d.id
      `,
    )) as Array<{ dispatch_id: number; fecha_despacho: string; invoice_id: number | null; invoice_number: string | null }>;

    const lines = (await this.dataSource.query(
      `
      SELECT
        ii.id AS line_id,
        ii.invoice_id,
        i.invoice_number,
        d.id AS dispatch_id,
        d.fecha_despacho::text AS fecha_despacho,
        ii.tarja_id,
        ii.fruit_process_id,
        ii.final_pallet_id,
        COALESCE(ii.cajas, 0)::numeric AS cajas,
        ii.line_subtotal::numeric AS line_subtotal,
        ii.packaging_code,
        CASE
          WHEN ii.pounds IS NULL THEN 0::numeric
          WHEN BTRIM(ii.pounds::text) = '' THEN 0::numeric
          WHEN BTRIM(ii.pounds::text) ~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$' THEN BTRIM(ii.pounds::text)::numeric
          ELSE 0::numeric
        END AS lb_line
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      JOIN dispatches d ON d.id = i.dispatch_id
      WHERE 1=1 ${this.withDate('d.fecha_despacho', filter)}
      ORDER BY d.id, ii.id
      `,
    )) as Array<{
      line_id: number;
      invoice_id: number;
      invoice_number: string | null;
      dispatch_id: number;
      fecha_despacho: string;
      tarja_id: number | null;
      fruit_process_id: number | null;
      final_pallet_id: number | null;
      cajas: string;
      line_subtotal: string;
      packaging_code: string | null;
      lb_line: string;
    }>;

    const tarjaIds = [...new Set(lines.map((l) => l.tarja_id).filter((x): x is number => x != null && Number(x) > 0))];
    const { tagsByTarja, fpByTarja } = await this.loadTarjaProducerMaps(tarjaIds);
    const fruitProcessIdsDiag = [
      ...new Set(lines.map((l) => l.fruit_process_id).filter((x): x is number => x != null && Number(x) > 0)),
    ];
    const producerByFruitProcessIdDiag = new Map<number, number>();
    if (fruitProcessIdsDiag.length) {
      const fpRows = (await this.dataSource.query(
        `SELECT id, productor_id FROM fruit_processes WHERE id = ANY($1::bigint[]) AND deleted_at IS NULL`,
        [fruitProcessIdsDiag],
      )) as Array<{ id: number; productor_id: number }>;
      for (const r of fpRows) producerByFruitProcessIdDiag.set(Number(r.id), Number(r.productor_id));
    }
    const fpIdsDiag = [
      ...new Set(lines.map((l) => l.final_pallet_id).filter((x): x is number => x != null && Number(x) > 0)),
    ];
    const palletSlicesDiag = await this.loadPalletProducerSlices(fpIdsDiag);
    const repalletSlicesDiag = await this.loadRepalletProvenanceProducerSlices(fpIdsDiag);

    const lineDiagnostics: Record<string, unknown>[] = [];
    let slicesIncluidas = 0;
    let slicesExcluidasFiltro = 0;

    for (const li of lines) {
      const tid = li.tarja_id != null && Number(li.tarja_id) > 0 ? Number(li.tarja_id) : null;
      const fpid =
        li.fruit_process_id != null && Number(li.fruit_process_id) > 0 ? Number(li.fruit_process_id) : null;
      const finalPid =
        li.final_pallet_id != null && Number(li.final_pallet_id) > 0 ? Number(li.final_pallet_id) : null;
      const tags = tid != null ? tagsByTarja.get(tid) : undefined;
      const ptCount = tags?.length ?? 0;
      const fpPid = tid != null ? fpByTarja.get(tid) ?? null : null;
      const procProd = fpid != null ? producerByFruitProcessIdDiag.get(fpid) ?? null : null;
      const { slices, source } = this.settlementSlicesForInvoiceLine(
        tid,
        fpid,
        finalPid,
        tagsByTarja,
        fpByTarja,
        producerByFruitProcessIdDiag,
        palletSlicesDiag,
        repalletSlicesDiag,
      );

      let resolucion: string;
      if (source === 'pt_tag_items') resolucion = 'pt_tag_items';
      else if (source === 'fruit_process_tarja') resolucion = 'fruit_process';
      else if (source === 'invoice_fruit_process') resolucion = 'fruit_process_direct';
      else if (source === 'final_pallet_lines') {
        const parts = finalPid != null ? palletSlicesDiag.get(finalPid) ?? [] : [];
        resolucion = parts.length > 1 ? 'final_pallet_multiproductor' : 'final_pallet_lines';
      } else if (source === 'repallet_provenance') {
        const parts = finalPid != null ? repalletSlicesDiag.get(finalPid) ?? [] : [];
        resolucion = parts.length > 1 ? 'repallet_multiproductor' : 'repallet_provenance';
      } else if (tid != null) resolucion = 'sin_productor';
      else resolucion = 'sin_tarja';

      const ptDetalle =
        tags?.map((t) => `prod ${t.productor_id}: ${t.cajas_generadas} cajas`).join('; ') ?? '';

      let incluyeAlguna = false;
      const motivos: string[] = [];

      for (const s of slices) {
        let excl = false;
        let motivo = '';
        if (prodFilter != null && s.productor_id != null && Number(s.productor_id) !== prodFilter) {
          excl = true;
          motivo = 'Filtro productor: slice de otro productor';
          slicesExcluidasFiltro += 1;
        } else if (prodFilter != null && s.productor_id == null) {
          excl = true;
          motivo = 'Filtro productor: slice sin productor (unidad PT sin trazabilidad o sin unidad PT)';
          slicesExcluidasFiltro += 1;
        }
        if (!excl) {
          incluyeAlguna = true;
          slicesIncluidas += 1;
        } else {
          motivos.push(motivo);
        }
      }

      const aporte = incluyeAlguna ? 'si' : 'no';
      let motivoExclusion: string | null = null;
      if (!incluyeAlguna && prodFilter != null) {
        if (
          tid == null &&
          procProd == null &&
          source !== 'final_pallet_lines' &&
          source !== 'repallet_provenance'
        ) {
          motivoExclusion =
            'Filtro productor activo: línea sin unidad PT y sin productor vía fruit_process (no se puede asignar)';
        } else if (tid == null && procProd != null) {
          motivoExclusion = 'Filtro productor: el productor del proceso no coincide con el filtro';
        } else if (resolucion === 'sin_productor') {
          motivoExclusion =
            'Filtro productor activo: unidad PT sin filas en pt_tag_items y sin fruit_process con esa unidad';
        } else {
          motivoExclusion = motivos[0] ?? 'Filtro productor: ningún slice coincide con el productor elegido';
        }
      }

      lineDiagnostics.push({
        line_id: li.line_id,
        invoice_id: li.invoice_id,
        invoice_number: li.invoice_number,
        dispatch_id: li.dispatch_id,
        fecha_despacho: li.fecha_despacho,
        tarja_id: tid,
        fruit_process_id: fpid,
        final_pallet_id: finalPid,
        tiene_tarja: tid != null,
        tiene_proceso_para_liquidacion:
          tid != null ||
          (fpid != null && procProd != null) ||
          source === 'final_pallet_lines' ||
          source === 'repallet_provenance',
        resolucion_source: source,
        packaging_code: li.packaging_code,
        cajas: Number(Number(li.cajas).toFixed(4)),
        lb: Number(Number(li.lb_line).toFixed(4)),
        ventas: Number(Number(li.line_subtotal).toFixed(2)),
        pt_tag_items_count: ptCount,
        pt_tag_items_detalle: ptDetalle || null,
        fruit_process_productor_id: fpPid,
        fruit_process_line_productor_id: procProd,
        resolucion_productor: resolucion,
        slices_json: JSON.stringify(slices),
        aporte_liquidacion: aporte,
        motivo_exclusion: motivoExclusion,
        notas:
          source === 'final_pallet_lines'
            ? resolucion === 'final_pallet_multiproductor'
              ? 'Varios productores en líneas del pallet final; prorrateo por cajas de cada proceso.'
              : 'Productor desde final_pallet_lines → fruit_processes (recepción / proceso).'
            : source === 'repallet_provenance'
              ? resolucion === 'repallet_multiproductor'
                ? 'Varios productores vía procedencia de repallet; prorrateo por cajas movidas desde pallets origen.'
                : 'Productor desde repallet_line_provenance (pallet formado por unión de pallets).'
            : tid == null && procProd != null
              ? 'Sin unidad PT en línea: liquidación por productor vía fruit_process en factura.'
              : tid == null && source === 'none'
                ? 'Sin unidad PT, sin proceso en línea ni trazabilidad en pallet: se contabiliza en (sin asignar).'
                : resolucion === 'sin_productor'
                  ? 'Unidad PT sin vínculo en pt_tag_items ni en fruit_processes.'
                  : null,
      });
    }

    return {
      meta: {
        fecha_desde: filter.fecha_desde ?? null,
        fecha_hasta: filter.fecha_hasta ?? null,
        sql_fecha_despacho: dateClause,
        filtro_productor_id_efectivo: prodFilter,
        filtro_productor_raw: filter.productor_id ?? null,
        lineas_factura_en_periodo: lines.length,
        despachos_en_periodo: dispatches.length,
        slices_incluidas_en_bump: slicesIncluidas,
        slices_excluidas_por_filtro_productor: slicesExcluidasFiltro,
        hint:
          lines.length === 0
            ? 'No hay líneas de factura cuyo despacho cumpla el filtro de fechas. Revisá fechas o que existan facturas emitidas.'
            : prodFilter != null && slicesIncluidas === 0 && lines.length > 0
              ? 'El filtro de productor excluye todos los slices; probá "Todos" o otro productor.'
              : null,
        nota_periodo:
          'Todas las filas en invoice_lines cumplen el filtro de fecha sobre despacho.fecha_despacho (no aplica “fuera de rango” para ellas).',
      },
      dispatches_included: dispatches,
      invoice_lines: lineDiagnostics,
    };
  }

  async producerSettlement(filter: ReportFilterDto) {
    const inner = await this.computeFormatCostingRows(filter);
    const settlement = await this.buildProducerSettlement(filter, inner);
    const diagnostic = await this.producerSettlementDiagnostic(filter);
    return {
      filters: filter,
      formatCostConfig: {
        precio_packing_por_lb: inner.precio_packing_por_lb,
        packing_source: inner.packing_source,
      },
      ...settlement,
      producerSettlementDiagnostic: diagnostic,
    };
  }

  /**
   * Rendimiento (% packout sobre entrada) y merma registrada, alineados al listado de procesos.
   * Usa filas enriquecidas de `buildProcessListRows` (no `porcentaje_procesado` crudo de BD).
   * Merma: lb_sobrante + lb_merma_balance, o merma_lb si la suma es ~0 — no merma residual calculada.
   */
  private async buildYieldAndWasteFromProcesses(filter: ReportFilterDto) {
    const rows = await this.processService.listProcessesForReporting({
      fecha_desde: filter.fecha_desde,
      fecha_hasta: filter.fecha_hasta,
      productor_id: filter.productor_id ?? null,
      variedad_id: filter.variedad_id ?? null,
    });
    const EPS = 1e-6;
    type YieldAgg = {
      productor_id: number;
      lote_id: number;
      merma_total_lb: number;
      peso_procesado_total: number;
      yields: number[];
    };
    const groups = new Map<string, YieldAgg>();
    for (const r of rows) {
      const key = `${r.productor_id}:${r.recepcion_id}`;
      const cur: YieldAgg =
        groups.get(key) ??
        {
          productor_id: r.productor_id,
          lote_id: r.recepcion_id,
          merma_total_lb: 0,
          peso_procesado_total: 0,
          yields: [],
        };
      const lbM = Number(r.lb_sobrante ?? 0) + Number(r.lb_merma_balance ?? 0);
      const merma = lbM > EPS ? lbM : Number(r.merma_lb ?? 0);
      cur.merma_total_lb += merma;
      cur.peso_procesado_total += Number(r.peso_procesado_lb ?? 0);
      cur.yields.push(Number(r.porcentaje_procesado ?? 0));
      groups.set(key, cur);
    }
    const sorted = [...groups.values()].sort((a, b) =>
      a.productor_id !== b.productor_id ? a.productor_id - b.productor_id : a.lote_id - b.lote_id,
    );
    const aggRows: Record<string, unknown>[] = sorted.map((g) => ({
      productor_id: g.productor_id,
      lote_id: g.lote_id,
      merma_total_lb: Number(g.merma_total_lb.toFixed(2)),
      peso_procesado_total: Number(g.peso_procesado_total.toFixed(2)),
      rendimiento_promedio:
        g.yields.length > 0 ? Number((g.yields.reduce((a, b) => a + b, 0) / g.yields.length).toFixed(4)) : 0,
    }));
    return this.paginateRows(aggRows, filter);
  }

  /**
   * Cajas facturadas en despachos del período, repartidas por productor con la misma lógica que liquidación
   * (`settlementSlicesForInvoiceLine`: tarja → proceso → líneas de pallet → procedencia de repallet).
   * Sin costos ni montos; solo cajas prorrateadas.
   */
  private async buildDispatchedBoxesByProducer(filter: ReportFilterDto) {
    const tarjaInv = filter.tarja_id ? ` AND ii.tarja_id = ${Number(filter.tarja_id)}` : '';
    const lines = (await this.dataSource.query(
      `
      SELECT
        ii.tarja_id,
        ii.fruit_process_id,
        ii.final_pallet_id,
        COALESCE(ii.cajas, 0)::numeric AS cajas
      FROM invoice_items ii
      JOIN invoices inv ON inv.id = ii.invoice_id
      JOIN dispatches d ON d.id = inv.dispatch_id
      WHERE 1=1 ${this.withDate('d.fecha_despacho', filter)} ${tarjaInv}
      ORDER BY d.id, ii.id
      `,
    )) as Array<{
      tarja_id: number | null;
      fruit_process_id: number | null;
      final_pallet_id: number | null;
      cajas: string;
    }>;

    const tarjaIds = [...new Set(lines.map((l) => l.tarja_id).filter((x): x is number => x != null && Number(x) > 0))];
    const { tagsByTarja, fpByTarja } = await this.loadTarjaProducerMaps(tarjaIds);
    const fruitProcessIds = [
      ...new Set(lines.map((l) => l.fruit_process_id).filter((x): x is number => x != null && Number(x) > 0)),
    ];
    const producerByFruitProcessId = new Map<number, number>();
    if (fruitProcessIds.length) {
      const fpRows = (await this.dataSource.query(
        `SELECT id, productor_id FROM fruit_processes WHERE id = ANY($1::bigint[]) AND deleted_at IS NULL`,
        [fruitProcessIds],
      )) as Array<{ id: number; productor_id: number }>;
      for (const r of fpRows) producerByFruitProcessId.set(Number(r.id), Number(r.productor_id));
    }
    const fpIdsForPallet = [
      ...new Set(lines.map((l) => l.final_pallet_id).filter((x): x is number => x != null && Number(x) > 0)),
    ];
    const palletSlicesByFpId = await this.loadPalletProducerSlices(fpIdsForPallet);
    const repalletSlicesByResultId = await this.loadRepalletProvenanceProducerSlices(fpIdsForPallet);
    const prodFilter = this.producerFilterId(filter);

    const byProd = new Map<number | null, number>();
    for (const li of lines) {
      const cajas = Number(li.cajas ?? 0);
      const { slices } = this.settlementSlicesForInvoiceLine(
        li.tarja_id != null && Number(li.tarja_id) > 0 ? Number(li.tarja_id) : null,
        li.fruit_process_id != null && Number(li.fruit_process_id) > 0 ? Number(li.fruit_process_id) : null,
        li.final_pallet_id != null && Number(li.final_pallet_id) > 0 ? Number(li.final_pallet_id) : null,
        tagsByTarja,
        fpByTarja,
        producerByFruitProcessId,
        palletSlicesByFpId,
        repalletSlicesByResultId,
      );
      for (const s of slices) {
        if (prodFilter != null && s.productor_id != null && Number(s.productor_id) !== prodFilter) continue;
        if (prodFilter != null && s.productor_id == null) continue;
        const pid = s.productor_id ?? null;
        byProd.set(pid, (byProd.get(pid) ?? 0) + cajas * s.frac);
      }
    }

    const producerIds = [...new Set([...byProd.keys()].filter((x): x is number => x != null && x > 0))];
    const names =
      producerIds.length > 0
        ? ((await this.dataSource.query(`SELECT id, nombre FROM producers WHERE id = ANY($1::bigint[])`, [producerIds])) as Array<{
            id: number;
            nombre: string;
          }>)
        : [];
    const nameById = new Map(names.map((n) => [Number(n.id), n.nombre]));

    const aggRows: Record<string, unknown>[] = [...byProd.entries()].map(([pid, cajas]) => ({
      productor_id: pid,
      productor_nombre: pid == null ? '(sin unidad PT / sin asignar)' : nameById.get(pid) ?? null,
      cajas_despachadas: Number(cajas.toFixed(4)),
    }));
    aggRows.sort((a, b) => {
      const na = a.productor_id == null ? 1 : 0;
      const nb = b.productor_id == null ? 1 : 0;
      if (na !== nb) return na - nb;
      return Number(a.productor_id ?? 0) - Number(b.productor_id ?? 0);
    });
    return this.paginateRows(aggRows, filter);
  }

  private async enrichYieldAlerts(rows: Record<string, unknown>[]) {
    const plant = await this.plantService.getOrCreate();
    const minYield = Number(plant.min_yield_percent);
    const maxMerma = Number(plant.max_merma_percent);
    return rows.map((r) => {
      const alerts: string[] = [];
      const rend = Number(r.rendimiento_promedio);
      const pesoProc = Number(r.peso_procesado_total ?? 0);
      const merma = Number(r.merma_total_lb ?? 0);
      const mermaPct = pesoProc > 0 ? (merma / pesoProc) * 100 : 0;
      if (!Number.isNaN(rend) && rend < minYield) {
        alerts.push(`rendimiento bajo: ${rend.toFixed(2)}% < ${minYield}%`);
      }
      if (mermaPct > maxMerma) {
        alerts.push(`merma alta: ${mermaPct.toFixed(2)}% > ${maxMerma}%`);
      }
      return { ...r, alertas: alerts };
    });
  }

  async generate(filter: ReportFilterDto) {
    const prod = filter.productor_id ? ` AND p.productor_id = ${Number(filter.productor_id)}` : '';
    const varf = filter.variedad_id ? ` AND p.variedad_id = ${Number(filter.variedad_id)}` : '';
    const tarja = filter.tarja_id ? ` AND p.tarja_id = ${Number(filter.tarja_id)}` : '';

    // Cajas generadas en PT: sumar pt_tag_items por proceso en el período (join por process_id).
    // El join solo por fruit_processes.tarja_id fallaba cuando tarja_id del proceso era NULL.
    const boxesSql = `
      SELECT p.productor_id, COALESCE(SUM(pti.cajas_generadas), 0)::bigint AS total_cajas
      FROM fruit_processes p
      LEFT JOIN pt_tag_items pti ON pti.process_id = p.id
      WHERE p.deleted_at IS NULL
      ${prod} ${varf} ${tarja} ${this.withDate('p.fecha_proceso', filter)}
      GROUP BY p.productor_id
      ORDER BY p.productor_id
    `;
    const boxesCountSql = `
      SELECT COUNT(*) AS c FROM (
        SELECT p.productor_id
        FROM fruit_processes p
        LEFT JOIN pt_tag_items pti ON pti.process_id = p.id
        WHERE p.deleted_at IS NULL
        ${prod} ${varf} ${tarja} ${this.withDate('p.fecha_proceso', filter)}
        GROUP BY p.productor_id
      ) sub
    `;
    const boxesByProducer = await this.paginateQuery(boxesSql, boxesCountSql, filter);

    // Desglose: una fila por línea pt_tag_items (mismos filtros que arriba). Operación = fruit_processes.id.
    const boxesDetailSql = `
      SELECT p.productor_id,
             p.id AS proceso_id,
             p.fecha_proceso,
             pti.tarja_id,
             COALESCE(t.format_code, '') AS format_code,
             p.variedad_id,
             COALESCE(v.nombre, '') AS variedad_nombre,
             pti.cajas_generadas AS cajas
      FROM fruit_processes p
      INNER JOIN pt_tag_items pti ON pti.process_id = p.id
      LEFT JOIN pt_tags t ON t.id = pti.tarja_id
      LEFT JOIN varieties v ON v.id = p.variedad_id
      WHERE p.deleted_at IS NULL
      ${prod} ${varf} ${tarja} ${this.withDate('p.fecha_proceso', filter)}
      ORDER BY p.productor_id, p.id, pti.tarja_id
    `;
    const boxesDetailCountSql = `
      SELECT COUNT(*)::bigint AS c FROM (
        SELECT 1
        FROM fruit_processes p
        INNER JOIN pt_tag_items pti ON pti.process_id = p.id
        WHERE p.deleted_at IS NULL
        ${prod} ${varf} ${tarja} ${this.withDate('p.fecha_proceso', filter)}
      ) sub
    `;
    const boxesByProducerDetail = await this.paginateQuery(boxesDetailSql, boxesDetailCountSql, filter);
    const dispatchedBoxesByProducer = await this.buildDispatchedBoxesByProducer(filter);

    const palletSql = `
      SELECT dti.tarja_id, AVG(dti.pallet_cost) AS costo_promedio_pallet
      FROM dispatch_tag_items dti
      WHERE 1=1 ${filter.tarja_id ? ` AND dti.tarja_id = ${Number(filter.tarja_id)}` : ''}
      GROUP BY dti.tarja_id
      ORDER BY dti.tarja_id
    `;
    const palletCountSql = `
      SELECT COUNT(*) AS c FROM (
        SELECT dti.tarja_id
        FROM dispatch_tag_items dti
        WHERE 1=1 ${filter.tarja_id ? ` AND dti.tarja_id = ${Number(filter.tarja_id)}` : ''}
        GROUP BY dti.tarja_id
      ) sub
    `;
    const palletCosts = await this.paginateQuery(palletSql, palletCountSql, filter);

    const yieldRaw = await this.buildYieldAndWasteFromProcesses(filter);
    yieldRaw.rows = await this.enrichYieldAlerts(yieldRaw.rows);

    const salesSql = `
      SELECT d.id AS dispatch_id,
             COALESCE(SUM(ii.line_subtotal),0) AS total_ventas,
             COALESCE(SUM(ii.pallet_cost_total),0) AS total_costos
      FROM dispatches d
      LEFT JOIN invoices i ON i.dispatch_id = d.id
      LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
      WHERE 1=1 ${this.withDate('d.fecha_despacho', filter)}
      GROUP BY d.id
      ORDER BY d.id
    `;
    const salesCountSql = `
      SELECT COUNT(*) AS c FROM (
        SELECT d.id
        FROM dispatches d
        LEFT JOIN invoices i ON i.dispatch_id = d.id
        LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
        WHERE 1=1 ${this.withDate('d.fecha_despacho', filter)}
        GROUP BY d.id
      ) sub
    `;
    const salesAndCostsByDispatch = await this.paginateQuery(salesSql, salesCountSql, filter);

    const packSql = `
      SELECT pf.format_code,
             COALESCE(SUM(c.material_cost_total),0) AS costo_total_embalaje,
             COUNT(c.id) AS consumos
      FROM packaging_pallet_consumptions c
      JOIN packaging_recipes r ON r.id = c.recipe_id
      JOIN presentation_formats pf ON pf.id = r.presentation_format_id
      WHERE 1=1 ${filter.tarja_id ? ` AND c.tarja_id = ${Number(filter.tarja_id)}` : ''}
      GROUP BY pf.format_code
      ORDER BY pf.format_code
    `;
    const packCountSql = `
      SELECT COUNT(*) AS c FROM (
        SELECT pf.format_code
        FROM packaging_pallet_consumptions c
        JOIN packaging_recipes r ON r.id = c.recipe_id
        JOIN presentation_formats pf ON pf.id = r.presentation_format_id
        WHERE 1=1 ${filter.tarja_id ? ` AND c.tarja_id = ${Number(filter.tarja_id)}` : ''}
        GROUP BY pf.format_code
      ) sub
    `;
    const packagingByFormat = await this.paginateQuery(packSql, packCountSql, filter);
    const formatInner = await this.computeFormatCostingRows(filter);
    const formatCosting = {
      precio_packing_por_lb: formatInner.precio_packing_por_lb,
      packing_source: formatInner.packing_source,
      summary: this.paginateRows(formatInner.summaryRows, filter),
      lines: this.paginateRows(formatInner.linesRows, filter),
    };
    const producerSettlement = await this.buildProducerSettlement(filter, formatInner);
    const producerSettlementDiagnostic = await this.producerSettlementDiagnostic(filter);
    const clientMargin = await this.computeClientMarginRows(filter, formatInner);

    const plant = await this.plantService.getOrCreate();

    return {
      filters: filter,
      plant_thresholds: {
        yield_tolerance_percent: Number(plant.yield_tolerance_percent),
        min_yield_percent: Number(plant.min_yield_percent),
        max_merma_percent: Number(plant.max_merma_percent),
      },
      boxesByProducer,
      boxesByProducerDetail,
      dispatchedBoxesByProducer,
      palletCosts,
      yieldAndWaste: yieldRaw,
      salesAndCostsByDispatch,
      packagingByFormat,
      formatCostSummary: formatCosting.summary,
      formatCostLines: formatCosting.lines,
      formatCostConfig: {
        precio_packing_por_lb: formatCosting.precio_packing_por_lb,
        packing_source: formatCosting.packing_source,
      },
      producerSettlementSummary: producerSettlement.producerSettlementSummary,
      producerSettlementDetail: producerSettlement.producerSettlementDetail,
      producerSettlementDiagnostic,
      clientMarginSummary: this.paginateRows(clientMargin.summaryRows, filter),
      clientMarginDetail: this.paginateRows(clientMargin.detailRows, filter),
    };
  }

  async formatCost(filter: ReportFilterDto) {
    const formatCosting = await this.buildFormatCosting(filter);
    return {
      filters: filter,
      config: {
        precio_packing_por_lb: formatCosting.precio_packing_por_lb,
        packing_source: formatCosting.packing_source,
      },
      formatCostSummary: formatCosting.summary,
      formatCostLines: formatCosting.lines,
    };
  }

  async listPackingCosts() {
    const rows = await this.packingCostRepo.find({ order: { id: 'DESC' } });
    const speciesIds = [...new Set(rows.map((r) => Number(r.species_id)).filter((x) => x > 0))];
    const species = speciesIds.length
      ? ((await this.dataSource.query(
          `SELECT id, nombre FROM species WHERE id = ANY($1::bigint[])`,
          [speciesIds],
        )) as Array<{ id: number; nombre: string }>)
      : [];
    const sMap = new Map(species.map((s) => [Number(s.id), s.nombre]));
    return rows.map((r) => ({
      id: r.id,
      species_id: Number(r.species_id),
      species_name: sMap.get(Number(r.species_id)) ?? null,
      season: r.season,
      price_per_lb: Number(r.price_per_lb),
      active: !!r.active,
      created_at: r.created_at,
    }));
  }

  async upsertPackingCost(dto: UpsertPackingCostDto) {
    const sid = Number(dto.species_id);
    const species = await this.dataSource.query(`SELECT id FROM species WHERE id = $1`, [sid]);
    if (!species?.length) throw new NotFoundException('Especie no encontrada');
    const season = dto.season?.trim() || null;
    const existing = await this.packingCostRepo.findOne({
      where: { species_id: sid, season: season as unknown as string | null },
    });
    if (existing) {
      existing.price_per_lb = Number(dto.price_per_lb).toFixed(6);
      if (dto.active != null) existing.active = dto.active;
      return this.packingCostRepo.save(existing);
    }
    return this.packingCostRepo.save(
      this.packingCostRepo.create({
        species_id: sid,
        season,
        price_per_lb: Number(dto.price_per_lb).toFixed(6),
        active: dto.active ?? true,
      }),
    );
  }

  /** Dataset plano para exportación (sin paginar por sección). */
  async generateFullExport(filter: ReportFilterDto) {
    const full = { ...filter, page: 1, limit: 10000 };
    return this.generate(full);
  }

  saveReport(dto: SaveReportDto) {
    return this.reportRepo.save(this.reportRepo.create(dto));
  }

  listSavedReports() {
    return this.reportRepo.find({ order: { id: 'DESC' } });
  }

  async updateSavedReport(id: number, dto: SaveReportDto) {
    const report = await this.reportRepo.findOne({ where: { id } });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    report.report_name = dto.report_name;
    report.filters = dto.filters;
    report.payload = dto.payload;
    return this.reportRepo.save(report);
  }

  async deleteSavedReport(id: number) {
    const report = await this.reportRepo.findOne({ where: { id } });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    await this.reportRepo.delete(id);
  }

  /**
   * Etiquetas para encabezado de PDF de liquidación (sin cálculos monetarios).
   */
  async getSettlementPdfMeta(filter: ReportFilterDto): Promise<{
    productorNombre: string | null;
    especieLabel: string | null;
    formatoCodigo: string | null;
  }> {
    let productorNombre: string | null = null;
    const pid = filter.productor_id != null && Number(filter.productor_id) > 0 ? Number(filter.productor_id) : null;
    if (pid) {
      const rows = (await this.dataSource.query(`SELECT nombre FROM producers WHERE id = $1`, [pid])) as Array<{
        nombre: string;
      }>;
      productorNombre = rows[0]?.nombre?.trim() ?? null;
    }

    const fc = filter.format_code?.trim() ?? null;
    let especieLabel: string | null = null;
    if (fc) {
      const rows = (await this.dataSource.query(
        `SELECT s.nombre AS species_nombre
         FROM presentation_formats pf
         LEFT JOIN species s ON s.id = pf.species_id
         WHERE LOWER(TRIM(pf.format_code)) = LOWER(TRIM($1))
         LIMIT 1`,
        [fc],
      )) as Array<{ species_nombre: string | null }>;
      especieLabel = rows[0]?.species_nombre?.trim() ?? null;
    }
    if (!especieLabel) {
      const vid = filter.variedad_id != null && Number(filter.variedad_id) > 0 ? Number(filter.variedad_id) : null;
      if (vid) {
        const rows = (await this.dataSource.query(
          `SELECT v.nombre AS variedad, s.nombre AS especie
           FROM varieties v
           INNER JOIN species s ON s.id = v.species_id
           WHERE v.id = $1
           LIMIT 1`,
          [vid],
        )) as Array<{ variedad: string; especie: string }>;
        if (rows[0]) {
          const vn = rows[0].variedad?.trim() ?? '';
          const sn = rows[0].especie?.trim() ?? '';
          especieLabel = sn ? `${vn} — ${sn}` : vn || null;
        }
      }
    }

    return {
      productorNombre,
      especieLabel,
      formatoCodigo: fc,
    };
  }
}

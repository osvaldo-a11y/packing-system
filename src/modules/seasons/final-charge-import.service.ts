import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import ExcelJS from 'exceljs';
import { Repository } from 'typeorm';
import { ImportLog } from '../import/import-log.entity';
import { Brand } from '../traceability/operational.entities';
import { Producer, Variety } from '../traceability/traceability.entities';
import {
  buildSettlementRowHash,
  mapHeaderRow,
  normalizeAliasKey,
  parseDecimalCell,
  parseIntCell,
  parseMoney,
  parsePickType,
  parseShipDate,
  trimCell,
} from './final-charge.util';
import { LegacyValueAlias, SeasonSettlementLine } from './legacy.entities';
import { Season } from './season.entity';

export type FinalChargeImportError = { row: number; field?: string; message: string };

export type FinalChargeImportResult = {
  season_year: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: FinalChargeImportError[];
  unmapped: {
    formats: string[];
    brands: string[];
    varieties: string[];
  };
  summary: {
    line_count: number;
    producer_count: number;
    boxes_total: number;
    pounds_total: number;
    revenue_total: number;
    grower_return_total: number;
    pack_fee_total: number;
    material_cost_total: number;
    by_producer: Array<{
      producer_raw: string;
      producer_id: number;
      line_count: number;
      boxes: number;
      revenue: number;
      grower_return: number;
    }>;
  };
  verification_targets_2025?: {
    expected: Record<string, number>;
    actual: Record<string, number>;
    match: boolean;
  };
};

@Injectable()
export class FinalChargeImportService {
  constructor(
    @InjectRepository(Season) private readonly seasonRepo: Repository<Season>,
    @InjectRepository(SeasonSettlementLine) private readonly lineRepo: Repository<SeasonSettlementLine>,
    @InjectRepository(LegacyValueAlias) private readonly aliasRepo: Repository<LegacyValueAlias>,
    @InjectRepository(Producer) private readonly producerRepo: Repository<Producer>,
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(Variety) private readonly varietyRepo: Repository<Variety>,
    @InjectRepository(ImportLog) private readonly importLogRepo: Repository<ImportLog>,
  ) {}

  async importFinalCharge(year: number, fileBuffer: Buffer, username: string): Promise<FinalChargeImportResult> {
    const season = await this.seasonRepo.findOne({ where: { year } });
    if (!season) {
      await this.seasonRepo.save(
        this.seasonRepo.create({
          year,
          label: `Temporada ${year} (legacy)`,
          status: 'closing',
          source: 'legacy',
          opened_at: new Date(),
          notes: 'Creada automáticamente por import Final Charge',
        }),
      );
    } else if (season.status === 'closed') {
      throw new BadRequestException(`La temporada ${year} está cerrada; no se puede importar.`);
    }

    const aliasMaps = await this.loadAliasMaps(year);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as never);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('El archivo Excel no tiene hojas.');

    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber - 1] = trimCell(cell.value);
    });
    const colMap = mapHeaderRow(headers);
    if (!colMap.has('producer')) {
      throw new BadRequestException('Columna Producer/Productor no encontrada en fila 1.');
    }

    const errors: FinalChargeImportError[] = [];
    const pendingFormats = new Set<string>();
    const pendingBrands = new Set<string>();
    const pendingVarieties = new Set<string>();

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
      const row = sheet.getRow(rowNum);
      const get = (field: string): unknown => {
        const idx = colMap.get(field);
        if (idx == null) return null;
        return row.getCell(idx + 1).value;
      };

      const producerRaw = trimCell(get('producer'));
      if (!producerRaw) {
        skipped++;
        continue;
      }

      const producerKey = normalizeAliasKey(producerRaw);
      const producerId = aliasMaps.producer.get(producerKey) ?? null;
      if (producerId == null) {
        errors.push({ row: rowNum, field: 'producer', message: `Productor no resuelto: "${producerRaw}"` });
        continue;
      }

      const formatRaw = trimCell(get('format')) || 'UNKNOWN';
      const formatKey = normalizeAliasKey(formatRaw);
      let formatCode = aliasMaps.format.get(formatKey) ?? formatRaw;
      if (!aliasMaps.format.has(formatKey) && formatRaw !== 'UNKNOWN') {
        pendingFormats.add(formatRaw);
      }

      const brandRaw = trimCell(get('brand')) || null;
      let brandId: number | null = null;
      if (brandRaw) {
        const brandKey = normalizeAliasKey(brandRaw);
        brandId = aliasMaps.brand.get(brandKey) ?? null;
        if (brandId == null) pendingBrands.add(brandRaw);
      }

      const varietyRaw = trimCell(get('variety')) || null;
      let varietyId: number | null = null;
      if (varietyRaw) {
        const varietyKey = normalizeAliasKey(varietyRaw);
        varietyId = aliasMaps.variety.get(varietyKey) ?? null;
        if (varietyId == null) pendingVarieties.add(varietyRaw);
      }

      const shipDate = parseShipDate(get('ship_date'));

      const bol = trimCell(get('bol')) || `NO-BOL-${rowNum}`;
      const palletRef = trimCell(get('pallet_ref'));
      const boxes = parseIntCell(get('boxes'));
      const pounds = parseDecimalCell(get('pounds'));
      const revenue = parseMoney(get('revenue'));
      const growerReturn = parseMoney(get('grower_return'));
      const packFee = parseMoney(get('pack_fee'));
      const materialCost = parseMoney(get('material_cost'));

      const rowHash = buildSettlementRowHash({
        season_year: year,
        source_row_no: rowNum,
        bol,
        pallet_ref: palletRef,
        format_raw: formatRaw,
        boxes,
        pounds,
      });

      const existing =
        (await this.lineRepo.findOne({ where: { season_year: year, source_row_no: rowNum } })) ??
        (await this.lineRepo.findOne({ where: { season_year: year, row_hash: rowHash } }));
      const entity = existing ?? this.lineRepo.create();
      const isUpdate = Boolean(existing);

      entity.season_year = year;
      entity.producer_id = producerId;
      entity.producer_raw = producerRaw;
      entity.brand_id = brandId;
      entity.brand_raw = brandRaw;
      entity.variety_id = varietyId;
      entity.variety_raw = varietyRaw;
      entity.format_code = formatCode;
      entity.format_raw = formatRaw;
      entity.ship_date = shipDate;
      entity.pick_type = parsePickType(trimCell(get('pick_type')));
      entity.bol = bol;
      entity.pallet_ref = palletRef;
      entity.customer_raw = trimCell(get('customer')) || null;
      entity.market_raw = trimCell(get('market')) || null;
      entity.boxes = boxes;
      entity.pounds = pounds.toFixed(4);
      entity.unit_price = parseMoney(get('unit_price')).toFixed(6);
      entity.revenue = revenue.toFixed(2);
      entity.grower_return = growerReturn.toFixed(2);
      entity.pack_fee = packFee.toFixed(2);
      entity.material_cost = materialCost.toFixed(2);
      entity.grade_raw = trimCell(get('grade')) || null;
      entity.invoice_ref = trimCell(get('invoice_ref')) || null;
      entity.notes = trimCell(get('notes')) || null;
      entity.source = 'legacy_final_charge';
      entity.row_hash = rowHash;
      entity.source_row_no = rowNum;
      entity.excel_row_number = rowNum;

      await this.lineRepo.save(entity);
      if (isUpdate) updated++;
      else inserted++;
    }

    const summary = await this.buildSummary(year);
    const result: FinalChargeImportResult = {
      season_year: year,
      inserted,
      updated,
      skipped,
      errors,
      unmapped: {
        formats: [...pendingFormats].sort(),
        brands: [...pendingBrands].sort(),
        varieties: [...pendingVarieties].sort(),
      },
      summary,
    };

    if (year === 2025) {
      result.verification_targets_2025 = this.verify2025Targets(summary);
    }

    await this.importLogRepo.save(
      this.importLogRepo.create({
        username,
        entity_key: 'legacy_final_charge',
        total_rows: inserted + updated + skipped + errors.length,
        inserted: inserted + updated,
        skipped,
        errors_count: errors.length,
        errors_sample: errors.slice(0, 25),
      }),
    );

    return result;
  }

  private async loadAliasMaps(seasonYear: number) {
    const aliases = await this.aliasRepo.find({ where: { active: true } });
    const producer = new Map<string, number>();
    const format = new Map<string, string>();
    const brand = new Map<string, number>();
    const variety = new Map<string, number>();

    for (const a of aliases) {
      if (a.season_year != null && a.season_year !== seasonYear) continue;
      const key = normalizeAliasKey(a.raw_value);
      if (a.kind === 'producer' && a.resolved_id != null) producer.set(key, Number(a.resolved_id));
      if (a.kind === 'format' && a.resolved_code) format.set(key, a.resolved_code);
      if (a.kind === 'brand' && a.resolved_id != null) brand.set(key, Number(a.resolved_id));
      if (a.kind === 'variety' && a.resolved_id != null) variety.set(key, Number(a.resolved_id));
    }

    const producers = await this.producerRepo.find();
    for (const p of producers) {
      producer.set(normalizeAliasKey(p.nombre), Number(p.id));
    }

    const brands = await this.brandRepo.find();
    for (const b of brands) {
      brand.set(normalizeAliasKey(b.nombre), Number(b.id));
      brand.set(normalizeAliasKey(b.codigo), Number(b.id));
    }

    const varieties = await this.varietyRepo.find();
    for (const v of varieties) {
      variety.set(normalizeAliasKey(v.nombre), Number(v.id));
      if (v.codigo) variety.set(normalizeAliasKey(v.codigo), Number(v.id));
    }

    return { producer, format, brand, variety };
  }

  async buildSummary(seasonYear: number): Promise<FinalChargeImportResult['summary']> {
    const rows = (await this.lineRepo.query(
      `
      SELECT
        producer_id,
        producer_raw,
        COUNT(*)::int AS line_count,
        COALESCE(SUM(boxes), 0)::numeric AS boxes,
        COALESCE(SUM(pounds::numeric), 0)::numeric AS pounds,
        COALESCE(SUM(revenue::numeric), 0)::numeric AS revenue,
        COALESCE(SUM(grower_return::numeric), 0)::numeric AS grower_return,
        COALESCE(SUM(pack_fee::numeric), 0)::numeric AS pack_fee,
        COALESCE(SUM(material_cost::numeric), 0)::numeric AS material_cost
      FROM season_settlement_lines
      WHERE season_year = $1
      GROUP BY producer_id, producer_raw
      ORDER BY revenue DESC
      `,
      [seasonYear],
    )) as Array<{
      producer_id: number;
      producer_raw: string;
      line_count: number;
      boxes: number;
      pounds: string;
      revenue: string;
      grower_return: string;
      pack_fee: string;
      material_cost: string;
    }>;

    const totals = rows.reduce(
      (acc, r) => ({
        line_count: acc.line_count + Number(r.line_count ?? 0),
        boxes: acc.boxes + Number(r.boxes ?? 0),
        pounds: acc.pounds + Number(r.pounds ?? 0),
        revenue: acc.revenue + Number(r.revenue ?? 0),
        grower_return: acc.grower_return + Number(r.grower_return ?? 0),
        pack_fee: acc.pack_fee + Number(r.pack_fee ?? 0),
        material_cost: acc.material_cost + Number(r.material_cost ?? 0),
      }),
      {
        line_count: 0,
        boxes: 0,
        pounds: 0,
        revenue: 0,
        grower_return: 0,
        pack_fee: 0,
        material_cost: 0,
      },
    );

    return {
      line_count: totals.line_count,
      producer_count: rows.length,
      boxes_total: totals.boxes,
      pounds_total: Number(totals.pounds.toFixed(2)),
      revenue_total: Number(totals.revenue.toFixed(2)),
      grower_return_total: Number(totals.grower_return.toFixed(2)),
      pack_fee_total: Number(totals.pack_fee.toFixed(2)),
      material_cost_total: Number(totals.material_cost.toFixed(2)),
      by_producer: rows.map((r) => ({
        producer_raw: String(r.producer_raw),
        producer_id: Number(r.producer_id),
        line_count: Number(r.line_count),
        boxes: Number(r.boxes),
        revenue: Number(Number(r.revenue).toFixed(2)),
        grower_return: Number(Number(r.grower_return).toFixed(2)),
      })),
    };
  }

  private verify2025Targets(summary: FinalChargeImportResult['summary']) {
    const expected = {
      line_count: 1227,
      producer_count: 8,
      boxes_total: 143600,
      pounds_total: 1354617.6,
      revenue_total: 4556301.38,
      grower_return_total: 3440695.32,
      pack_fee_total: 651608.06,
      material_cost_total: 463998.0,
    };
    const actual = {
      line_count: summary.line_count,
      producer_count: summary.producer_count,
      boxes_total: summary.boxes_total,
      pounds_total: summary.pounds_total,
      revenue_total: summary.revenue_total,
      grower_return_total: summary.grower_return_total,
      pack_fee_total: summary.pack_fee_total,
      material_cost_total: summary.material_cost_total,
    };
    const match =
      actual.line_count === expected.line_count &&
      actual.producer_count === expected.producer_count &&
      Math.abs(actual.boxes_total - expected.boxes_total) < 0.01 &&
      Math.abs(actual.pounds_total - expected.pounds_total) < 0.01 &&
      Math.abs(actual.revenue_total - expected.revenue_total) < 0.01 &&
      Math.abs(actual.grower_return_total - expected.grower_return_total) < 0.01 &&
      Math.abs(actual.pack_fee_total - expected.pack_fee_total) < 0.01 &&
      Math.abs(actual.material_cost_total - expected.material_cost_total) < 0.01;

    return { expected, actual, match };
  }

  async getSettlementSummary(year: number) {
    const season = await this.seasonRepo.findOne({ where: { year } });
    if (!season) throw new NotFoundException(`Temporada ${year} no encontrada`);
    const summary = await this.buildSummary(year);
    return { season, summary };
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImportLog } from '../import/import-log.entity';
import { Producer } from '../traceability/traceability.entities';
import { normalizeAliasKey } from './final-charge.util';
import {
  LegacyValueAlias,
  SeasonMassBalance,
  SeasonProcessLine,
  SeasonReceptionLine,
} from './legacy.entities';
import { Season } from './season.entity';
import {
  closeLb,
  parseProcessWorkbook,
  parseReceptionWorkbook,
  PHYSICAL_LINES_VERIFICATION_TARGETS,
} from './physical-lines.util';

export type PhysicalLinesProducerDelta = {
  producer_id: number;
  producer_name: string;
  field: string;
  lines_value: number;
  aggregate_value: number;
  delta: number;
};

export type PhysicalLinesVerification = {
  match: boolean;
  reception_lines_total: number;
  reception_lines_fresh: number;
  lb_fresh: number;
  lb_waste: number;
  lb_for_frozen: number;
  process_lines: number;
  lb_processed: number;
  lb_packout: number;
  lb_waste_process: number;
  expected?: {
    reception_lines_total: number;
    reception_lines_fresh: number;
    lb_fresh: number;
    lb_waste: number;
    lb_for_frozen: number;
    process_lines: number;
    lb_processed: number;
    lb_packout: number;
    lb_waste_process: number;
  };
  count_match?: boolean;
  total_match?: boolean;
  producer_deltas: PhysicalLinesProducerDelta[];
};

export type PhysicalLinesImportResult = {
  season_year: number;
  reception_lines_upserted: number;
  process_lines_upserted: number;
  errors: Array<{ row?: number; message: string }>;
  verification: PhysicalLinesVerification;
};

@Injectable()
export class PhysicalLinesImportService {
  constructor(
    @InjectRepository(Season) private readonly seasonRepo: Repository<Season>,
    @InjectRepository(SeasonReceptionLine) private readonly receptionLineRepo: Repository<SeasonReceptionLine>,
    @InjectRepository(SeasonProcessLine) private readonly processLineRepo: Repository<SeasonProcessLine>,
    @InjectRepository(SeasonMassBalance) private readonly massBalanceRepo: Repository<SeasonMassBalance>,
    @InjectRepository(LegacyValueAlias) private readonly aliasRepo: Repository<LegacyValueAlias>,
    @InjectRepository(Producer) private readonly producerRepo: Repository<Producer>,
    @InjectRepository(ImportLog) private readonly importLogRepo: Repository<ImportLog>,
  ) {}

  async importPhysicalLines(
    year: number,
    receptionsBuffer: Buffer,
    processesBuffer: Buffer,
    username: string,
  ): Promise<PhysicalLinesImportResult> {
    const season = await this.seasonRepo.findOne({ where: { year } });
    if (!season) throw new BadRequestException(`Temporada ${year} no encontrada`);
    if (year === 2026) {
      throw new BadRequestException('2026 no se carga por líneas legacy; sus datos viven en operación en vivo.');
    }
    if (season.status === 'closed') {
      throw new BadRequestException(`La temporada ${year} está cerrada.`);
    }

    const producerMap = await this.loadProducerAliasMap(year);
    const formatMap = await this.loadFormatAliasMap(year);

    const receptionParsed = await parseReceptionWorkbook(receptionsBuffer, year);
    const processParsed = await parseProcessWorkbook(processesBuffer, year);
    const errors: PhysicalLinesImportResult['errors'] = [
      ...receptionParsed.errors.map((e) => ({ row: e.row, message: e.message })),
      ...processParsed.errors.map((e) => ({ row: e.row, message: e.message })),
    ];

    let receptionUpserted = 0;
    for (const line of receptionParsed.lines) {
      const producerId = producerMap.get(normalizeAliasKey(line.producer_raw));
      if (producerId == null) {
        errors.push({
          row: line.source_row_no,
          message: `Productor no resuelto en recepción: "${line.producer_raw}"`,
        });
        continue;
      }

      const existing =
        (await this.receptionLineRepo.findOne({
          where: { season_year: year, source_row_no: line.source_row_no },
        })) ??
        (await this.receptionLineRepo.findOne({
          where: { season_year: year, row_hash: line.row_hash },
        }));

      const entity = existing ?? this.receptionLineRepo.create();
      entity.season_year = year;
      entity.producer_id = producerId;
      entity.producer_raw = line.producer_raw;
      entity.reception_date = line.reception_date;
      entity.quality = line.quality;
      entity.specie = line.specie;
      entity.variety = line.variety;
      entity.incoming_no = line.incoming_no;
      entity.line_no = line.line_no;
      entity.reference = line.reference;
      entity.trays = line.trays;
      entity.quantity = line.quantity != null ? line.quantity.toFixed(4) : null;
      entity.net_lb = line.net_lb.toFixed(4);
      entity.gross_lb = line.gross_lb != null ? line.gross_lb.toFixed(4) : null;
      entity.fruit_type = line.fruit_type;
      entity.source = 'legacy_assembled';
      entity.row_hash = line.row_hash;
      entity.source_row_no = line.source_row_no;
      await this.receptionLineRepo.save(entity);
      receptionUpserted++;
    }

    let processUpserted = 0;
    for (const line of processParsed.lines) {
      const producerId = producerMap.get(normalizeAliasKey(line.producer_raw));
      if (producerId == null) {
        errors.push({
          row: line.source_row_no,
          message: `Productor no resuelto en procesos: "${line.producer_raw}"`,
        });
        continue;
      }

      const formatRaw = line.format_raw ?? '';
      const formatCode = formatRaw
        ? (formatMap.get(normalizeAliasKey(formatRaw)) ?? formatRaw)
        : null;

      const existing =
        (await this.processLineRepo.findOne({
          where: { season_year: year, source_row_no: line.source_row_no },
        })) ??
        (await this.processLineRepo.findOne({
          where: { season_year: year, row_hash: line.row_hash },
        }));

      const entity = existing ?? this.processLineRepo.create();
      entity.season_year = year;
      entity.producer_id = producerId;
      entity.producer_raw = line.producer_raw;
      entity.process_date = line.process_date;
      entity.op = line.op;
      entity.specie = line.specie;
      entity.variety = line.variety;
      entity.format_raw = line.format_raw;
      entity.format_code = formatCode;
      entity.lb_domp = line.lb_domp != null ? line.lb_domp.toFixed(4) : null;
      entity.lb_fresh = line.lb_fresh.toFixed(4);
      entity.lb_waste = line.lb_waste.toFixed(4);
      entity.lb_total = line.lb_total.toFixed(4);
      entity.boxes = line.boxes;
      entity.fruit_type = line.fruit_type;
      entity.source = 'legacy_assembled';
      entity.row_hash = line.row_hash;
      entity.source_row_no = line.source_row_no;
      await this.processLineRepo.save(entity);
      processUpserted++;
    }

    const verification = await this.verifyAgainstMassBalance(year);

    await this.importLogRepo.save(
      this.importLogRepo.create({
        username,
        entity_key: 'legacy_physical_lines',
        total_rows: receptionUpserted + processUpserted + errors.length,
        inserted: receptionUpserted + processUpserted,
        skipped: 0,
        errors_count: errors.length + verification.producer_deltas.length,
        errors_sample: [
          ...errors.slice(0, 10),
          ...verification.producer_deltas.slice(0, 10).map((d) => ({
            message: `${d.producer_name} ${d.field}: líneas=${d.lines_value} agregado=${d.aggregate_value} Δ=${d.delta}`,
          })),
        ],
      }),
    );

    return {
      season_year: year,
      reception_lines_upserted: receptionUpserted,
      process_lines_upserted: processUpserted,
      errors,
      verification,
    };
  }

  async verifyAgainstMassBalance(year: number): Promise<PhysicalLinesVerification> {
    const massRows = await this.massBalanceRepo.find({ where: { season_year: year } });
    if (!massRows.length) {
      throw new BadRequestException(`No hay agregados en season_mass_balance para ${year}.`);
    }

    const receptionAgg = (await this.receptionLineRepo.query(
      `
      SELECT
        producer_id,
        quality,
        COUNT(*)::int AS line_count,
        COALESCE(SUM(net_lb::numeric), 0)::numeric AS lb_total
      FROM season_reception_lines
      WHERE season_year = $1
      GROUP BY producer_id, quality
      `,
      [year],
    )) as Array<{ producer_id: string; quality: string; line_count: number; lb_total: string }>;

    const processAgg = (await this.processLineRepo.query(
      `
      SELECT
        producer_id,
        COUNT(*)::int AS line_count,
        COALESCE(SUM(lb_total::numeric), 0)::numeric AS lb_processed,
        COALESCE(SUM(lb_fresh::numeric), 0)::numeric AS lb_packout,
        COALESCE(SUM(lb_waste::numeric), 0)::numeric AS lb_waste
      FROM season_process_lines
      WHERE season_year = $1
      GROUP BY producer_id
      `,
      [year],
    )) as Array<{
      producer_id: string;
      line_count: number;
      lb_processed: string;
      lb_packout: string;
      lb_waste: string;
    }>;

    const receptionByProducer = new Map<
      number,
      { FRESH: number; WASTE: number; FOR_FROZEN: number; fresh_count: number; total_count: number }
    >();
    for (const r of receptionAgg) {
      const pid = Number(r.producer_id);
      const cur = receptionByProducer.get(pid) ?? {
        FRESH: 0,
        WASTE: 0,
        FOR_FROZEN: 0,
        fresh_count: 0,
        total_count: 0,
      };
      const lb = Number(r.lb_total);
      cur.total_count += Number(r.line_count);
      if (r.quality === 'FRESH') {
        cur.FRESH += lb;
        cur.fresh_count += Number(r.line_count);
      } else if (r.quality === 'WASTE') {
        cur.WASTE += lb;
      } else if (r.quality === 'FOR_FROZEN') {
        cur.FOR_FROZEN += lb;
      }
      receptionByProducer.set(pid, cur);
    }

    const processByProducer = new Map<
      number,
      { lb_processed: number; lb_packout: number; lb_waste: number; line_count: number }
    >();
    for (const p of processAgg) {
      processByProducer.set(Number(p.producer_id), {
        lb_processed: Number(p.lb_processed),
        lb_packout: Number(p.lb_packout),
        lb_waste: Number(p.lb_waste),
        line_count: Number(p.line_count),
      });
    }

    const producerDeltas: PhysicalLinesProducerDelta[] = [];
    const addDelta = (
      producerId: number,
      producerName: string,
      field: string,
      linesValue: number,
      aggregateValue: number,
    ) => {
      const delta = Number((linesValue - aggregateValue).toFixed(4));
      if (!closeLb(linesValue, aggregateValue)) {
        producerDeltas.push({
          producer_id: producerId,
          producer_name: producerName,
          field,
          lines_value: Number(linesValue.toFixed(2)),
          aggregate_value: Number(aggregateValue.toFixed(2)),
          delta,
        });
      }
    };

    for (const mb of massRows) {
      const pid = Number(mb.producer_id);
      const rec = receptionByProducer.get(pid) ?? {
        FRESH: 0,
        WASTE: 0,
        FOR_FROZEN: 0,
        fresh_count: 0,
        total_count: 0,
      };
      const proc = processByProducer.get(pid) ?? {
        lb_processed: 0,
        lb_packout: 0,
        lb_waste: 0,
        line_count: 0,
      };

      addDelta(pid, mb.producer_name, 'lb_received', rec.FRESH, Number(mb.lb_received));
      addDelta(pid, mb.producer_name, 'lb_rejected', rec.WASTE, Number(mb.lb_rejected));
      addDelta(pid, mb.producer_name, 'lb_for_frozen', rec.FOR_FROZEN, Number(mb.lb_for_frozen));
      addDelta(pid, mb.producer_name, 'lb_processed', proc.lb_processed, Number(mb.lb_processed));
      addDelta(pid, mb.producer_name, 'lb_packout', proc.lb_packout, Number(mb.lb_packout));
      addDelta(pid, mb.producer_name, 'lb_waste', proc.lb_waste, Number(mb.lb_waste));
    }

    const totals = {
      reception_lines_total: receptionAgg.reduce((s, r) => s + Number(r.line_count), 0),
      reception_lines_fresh: receptionAgg
        .filter((r) => r.quality === 'FRESH')
        .reduce((s, r) => s + Number(r.line_count), 0),
      lb_fresh: receptionAgg.filter((r) => r.quality === 'FRESH').reduce((s, r) => s + Number(r.lb_total), 0),
      lb_waste: receptionAgg.filter((r) => r.quality === 'WASTE').reduce((s, r) => s + Number(r.lb_total), 0),
      lb_for_frozen: receptionAgg
        .filter((r) => r.quality === 'FOR_FROZEN')
        .reduce((s, r) => s + Number(r.lb_total), 0),
      process_lines: processAgg.reduce((s, r) => s + Number(r.line_count), 0),
      lb_processed: processAgg.reduce((s, r) => s + Number(r.lb_processed), 0),
      lb_packout: processAgg.reduce((s, r) => s + Number(r.lb_packout), 0),
      lb_waste_process: processAgg.reduce((s, r) => s + Number(r.lb_waste), 0),
    };

    const expected = PHYSICAL_LINES_VERIFICATION_TARGETS[year];
    let countMatch = true;
    let totalMatch = true;
    if (expected) {
      countMatch =
        totals.reception_lines_total === expected.reception_lines_total &&
        totals.reception_lines_fresh === expected.reception_lines_fresh &&
        totals.process_lines === expected.process_lines;
      totalMatch =
        closeLb(totals.lb_fresh, expected.lb_fresh) &&
        closeLb(totals.lb_waste, expected.lb_waste) &&
        closeLb(totals.lb_for_frozen, expected.lb_for_frozen) &&
        closeLb(totals.lb_processed, expected.lb_processed) &&
        closeLb(totals.lb_packout, expected.lb_packout) &&
        closeLb(totals.lb_waste_process, expected.lb_waste_process);
    }

    const massTotals = {
      lb_received: massRows.reduce((s, r) => s + Number(r.lb_received), 0),
      lb_rejected: massRows.reduce((s, r) => s + Number(r.lb_rejected), 0),
      lb_for_frozen: massRows.reduce((s, r) => s + Number(r.lb_for_frozen), 0),
      lb_processed: massRows.reduce((s, r) => s + Number(r.lb_processed), 0),
      lb_packout: massRows.reduce((s, r) => s + Number(r.lb_packout), 0),
      lb_waste: massRows.reduce((s, r) => s + Number(r.lb_waste), 0),
    };

    if (!closeLb(totals.lb_fresh, massTotals.lb_received)) {
      producerDeltas.push({
        producer_id: 0,
        producer_name: 'TOTAL',
        field: 'lb_received',
        lines_value: Number(totals.lb_fresh.toFixed(2)),
        aggregate_value: Number(massTotals.lb_received.toFixed(2)),
        delta: Number((totals.lb_fresh - massTotals.lb_received).toFixed(4)),
      });
    }
    if (!closeLb(totals.lb_waste, massTotals.lb_rejected)) {
      producerDeltas.push({
        producer_id: 0,
        producer_name: 'TOTAL',
        field: 'lb_rejected',
        lines_value: Number(totals.lb_waste.toFixed(2)),
        aggregate_value: Number(massTotals.lb_rejected.toFixed(2)),
        delta: Number((totals.lb_waste - massTotals.lb_rejected).toFixed(4)),
      });
    }
    if (!closeLb(totals.lb_for_frozen, massTotals.lb_for_frozen)) {
      producerDeltas.push({
        producer_id: 0,
        producer_name: 'TOTAL',
        field: 'lb_for_frozen',
        lines_value: Number(totals.lb_for_frozen.toFixed(2)),
        aggregate_value: Number(massTotals.lb_for_frozen.toFixed(2)),
        delta: Number((totals.lb_for_frozen - massTotals.lb_for_frozen).toFixed(4)),
      });
    }
    if (!closeLb(totals.lb_processed, massTotals.lb_processed)) {
      producerDeltas.push({
        producer_id: 0,
        producer_name: 'TOTAL',
        field: 'lb_processed',
        lines_value: Number(totals.lb_processed.toFixed(2)),
        aggregate_value: Number(massTotals.lb_processed.toFixed(2)),
        delta: Number((totals.lb_processed - massTotals.lb_processed).toFixed(4)),
      });
    }
    if (!closeLb(totals.lb_packout, massTotals.lb_packout)) {
      producerDeltas.push({
        producer_id: 0,
        producer_name: 'TOTAL',
        field: 'lb_packout',
        lines_value: Number(totals.lb_packout.toFixed(2)),
        aggregate_value: Number(massTotals.lb_packout.toFixed(2)),
        delta: Number((totals.lb_packout - massTotals.lb_packout).toFixed(4)),
      });
    }
    if (!closeLb(totals.lb_waste_process, massTotals.lb_waste)) {
      producerDeltas.push({
        producer_id: 0,
        producer_name: 'TOTAL',
        field: 'lb_waste',
        lines_value: Number(totals.lb_waste_process.toFixed(2)),
        aggregate_value: Number(massTotals.lb_waste.toFixed(2)),
        delta: Number((totals.lb_waste_process - massTotals.lb_waste).toFixed(4)),
      });
    }

    const producerOnlyDeltas = producerDeltas.filter((d) => d.producer_id > 0);
    const match =
      producerOnlyDeltas.length === 0 &&
      (expected ? countMatch && totalMatch : true);

    return {
      match,
      ...totals,
      expected,
      count_match: expected ? countMatch : undefined,
      total_match: expected ? totalMatch : undefined,
      producer_deltas: producerDeltas,
    };
  }

  private async loadProducerAliasMap(seasonYear: number) {
    const aliases = await this.aliasRepo.find({ where: { active: true, kind: 'producer' } });
    const producer = new Map<string, number>();
    for (const a of aliases) {
      if (a.season_year != null && a.season_year !== seasonYear) continue;
      if (a.resolved_id != null) producer.set(normalizeAliasKey(a.raw_value), Number(a.resolved_id));
    }
    const producers = await this.producerRepo.find();
    for (const p of producers) {
      producer.set(normalizeAliasKey(p.nombre), Number(p.id));
      producer.set(normalizeAliasKey(p.codigo), Number(p.id));
    }
    return producer;
  }

  private async loadFormatAliasMap(seasonYear: number) {
    const aliases = await this.aliasRepo.find({ where: { active: true, kind: 'format' } });
    const format = new Map<string, string>();
    for (const a of aliases) {
      if (a.season_year != null && a.season_year !== seasonYear) continue;
      if (a.resolved_code) format.set(normalizeAliasKey(a.raw_value), a.resolved_code);
    }
    return format;
  }
}

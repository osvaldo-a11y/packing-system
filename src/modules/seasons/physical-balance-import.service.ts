import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import ExcelJS from 'exceljs';
import { Repository } from 'typeorm';
import { ImportLog } from '../import/import-log.entity';
import { Producer } from '../traceability/traceability.entities';
import { normalizeAliasKey } from './final-charge.util';
import { LegacyValueAlias, SeasonMassBalance, SeasonSettlementLine } from './legacy.entities';
import { Season } from './season.entity';
import {
  aggregateProcesses,
  aggregateReceptions,
  checkMassBalanceIntegrity,
  deriveFrozenToFrozen,
  LB_TOLERANCE,
  mapHeaderRow,
  pickDataSheet,
  PROCESSES_COLUMN_ALIASES,
  RECEPTIONS_COLUMN_ALIASES,
  TIEOUT_LB_PRODUCER_TOLERANCE,
  TIEOUT_LB_SEASON_TOLERANCE,
} from './physical-balance.util';

export type PhysicalBalanceProducerRow = {
  producer_id: number;
  producer_raw: string;
  receptions_count: number;
  lb_received: number;
  lb_rejected: number;
  lb_for_frozen: number;
  lb_frozen_to_frozen: number;
  processes_count: number;
  lb_processed: number;
  lb_packout: number;
  lb_waste: number;
  pct_packout: number;
  lb_invoiced: number;
  lb_difference: number;
  integrity_ok: boolean;
  integrity_mode: 'exact' | 'frozen_range';
  integrity_delta: number;
  tieout_ok: boolean;
};

export type PhysicalBalanceImportResult = {
  season_year: number;
  rows_upserted: number;
  errors: Array<{ producer_raw?: string; message: string }>;
  integrity_failures: Array<{
    producer_raw: string;
    lb_received: number;
    lb_for_frozen: number;
    lb_processed: number;
    delta: number;
    mode: 'exact' | 'frozen_range';
  }>;
  tieout_failures: Array<{ producer_raw: string; lb_packout: number; lb_invoiced: number; delta: number }>;
  cross_check_final_pallet?: { lb_packout_total: number; delta_vs_physical: number } | null;
  summary: {
    producer_count: number;
    receptions_count: number;
    lb_received_total: number;
    lb_rejected_total: number;
    lb_for_frozen_total: number;
    lb_frozen_to_frozen_total: number;
    lb_processed_total: number;
    lb_packout_total: number;
    lb_waste_total: number;
    lb_invoiced_total: number;
    lb_difference_total: number;
    integrity_ok: boolean;
    tieout_ok: boolean;
    by_producer: PhysicalBalanceProducerRow[];
  };
  verification_targets_2025?: {
    expected: Record<string, number>;
    actual: Record<string, number>;
    match: boolean;
  };
  verification_targets_2024?: {
    expected: Record<string, number>;
    actual: Record<string, number>;
    packout_by_producer: Record<string, { expected: number; actual: number; match: boolean }>;
    match: boolean;
  };
  verification_targets_2023?: {
    expected: Record<string, number>;
    actual: Record<string, number>;
    by_producer: Record<string, { expected: Record<string, number>; actual: Record<string, number>; match: boolean }>;
    match: boolean;
  };
};

@Injectable()
export class PhysicalBalanceImportService {
  constructor(
    @InjectRepository(Season) private readonly seasonRepo: Repository<Season>,
    @InjectRepository(SeasonMassBalance) private readonly massBalanceRepo: Repository<SeasonMassBalance>,
    @InjectRepository(SeasonSettlementLine) private readonly lineRepo: Repository<SeasonSettlementLine>,
    @InjectRepository(LegacyValueAlias) private readonly aliasRepo: Repository<LegacyValueAlias>,
    @InjectRepository(Producer) private readonly producerRepo: Repository<Producer>,
    @InjectRepository(ImportLog) private readonly importLogRepo: Repository<ImportLog>,
  ) {}

  async importPhysicalBalance(
    year: number,
    receptionsBuffer: Buffer,
    processesBuffer: Buffer,
    username: string,
    finalPalletBuffer?: Buffer,
  ): Promise<PhysicalBalanceImportResult> {
    const season = await this.seasonRepo.findOne({ where: { year } });
    if (!season) throw new BadRequestException(`Temporada ${year} no encontrada`);
    if (season.status === 'closed') {
      throw new BadRequestException(`La temporada ${year} está cerrada.`);
    }

    const producerMap = await this.loadProducerAliasMap(year);
    const invoicedByProducer = await this.loadInvoicedPounds(year);

    const receptionsAgg = await this.parseReceptions(receptionsBuffer);
    const processesAgg = await this.parseProcesses(processesBuffer);

    const producerKeys = new Set([...receptionsAgg.keys(), ...processesAgg.keys()]);
    const errors: PhysicalBalanceImportResult['errors'] = [];
    const integrityFailures: PhysicalBalanceImportResult['integrity_failures'] = [];
    const tieoutFailures: PhysicalBalanceImportResult['tieout_failures'] = [];
    const byProducer: PhysicalBalanceProducerRow[] = [];
    let rowsUpserted = 0;

    for (const key of producerKeys) {
      const rec = receptionsAgg.get(key);
      const proc = processesAgg.get(key);
      const producerRaw = rec?.producer_raw ?? proc?.producer_raw ?? key;
      const producerId = producerMap.get(key) ?? null;
      if (producerId == null) {
        errors.push({ producer_raw: producerRaw, message: `Productor no resuelto: "${producerRaw}"` });
        continue;
      }

      const lbReceived = rec?.lb_received ?? 0;
      const lbRejected = rec?.lb_rejected ?? 0;
      const lbForFrozen = rec?.lb_for_frozen ?? 0;
      const lbProcessed = proc?.lb_processed ?? 0;
      const lbPackout = proc?.lb_packout ?? 0;
      const lbWaste = proc?.lb_waste ?? 0;
      const lbFrozenToFrozen = deriveFrozenToFrozen(lbReceived, lbForFrozen, lbProcessed);
      const receptionsCount = rec?.incoming_refs.size ?? 0;
      const processesCount = proc?.processes_count ?? 0;
      const lbInvoiced = invoicedByProducer.get(producerId) ?? 0;

      const integrity = checkMassBalanceIntegrity(lbReceived, lbForFrozen, lbProcessed);
      const integrityOk = integrity.ok;
      if (!integrityOk) {
        integrityFailures.push({
          producer_raw: producerRaw,
          lb_received: lbReceived,
          lb_for_frozen: lbForFrozen,
          lb_processed: lbProcessed,
          delta: Number(integrity.delta.toFixed(3)),
          mode: integrity.mode,
        });
      }

      const tieoutDelta = Math.abs(lbPackout - lbInvoiced);
      const tieoutOk = tieoutDelta <= TIEOUT_LB_PRODUCER_TOLERANCE;
      if (!tieoutOk) {
        tieoutFailures.push({
          producer_raw: producerRaw,
          lb_packout: lbPackout,
          lb_invoiced: lbInvoiced,
          delta: Number((lbPackout - lbInvoiced).toFixed(3)),
        });
      }

      const pctPackout = lbProcessed > 0 ? (lbPackout / lbProcessed) * 100 : 0;
      const lbDifference = lbPackout - lbInvoiced;

      const existing = await this.massBalanceRepo.findOne({
        where: { season_year: year, producer_id: producerId },
      });
      const entity = existing ?? this.massBalanceRepo.create();
      entity.season_year = year;
      entity.producer_id = producerId;
      entity.producer_name = producerRaw;
      entity.receptions = receptionsCount;
      entity.lb_received = lbReceived.toFixed(3);
      entity.lb_rejected = lbRejected.toFixed(3);
      entity.lb_for_frozen = lbForFrozen.toFixed(3);
      entity.lb_frozen_to_frozen = lbFrozenToFrozen.toFixed(3);
      entity.processes = processesCount;
      entity.lb_processed = lbProcessed.toFixed(3);
      entity.lb_packout = lbPackout.toFixed(3);
      entity.lb_waste = lbWaste.toFixed(3);
      entity.pct_packout = pctPackout.toFixed(2);
      entity.lb_invoiced = lbInvoiced.toFixed(3);
      entity.difference = lbDifference.toFixed(3);
      entity.source = 'legacy_assembled';
      entity.loaded_at = new Date();
      await this.massBalanceRepo.save(entity);
      rowsUpserted++;

      byProducer.push({
        producer_id: producerId,
        producer_raw: producerRaw,
        receptions_count: receptionsCount,
        lb_received: Number(lbReceived.toFixed(2)),
        lb_rejected: Number(lbRejected.toFixed(2)),
        lb_for_frozen: Number(lbForFrozen.toFixed(2)),
        lb_frozen_to_frozen: Number(lbFrozenToFrozen.toFixed(2)),
        processes_count: processesCount,
        lb_processed: Number(lbProcessed.toFixed(2)),
        lb_packout: Number(lbPackout.toFixed(2)),
        lb_waste: Number(lbWaste.toFixed(2)),
        pct_packout: Number(pctPackout.toFixed(2)),
        lb_invoiced: Number(lbInvoiced.toFixed(2)),
        lb_difference: Number(lbDifference.toFixed(2)),
        integrity_ok: integrityOk,
        integrity_mode: integrity.mode,
        integrity_delta: Number(integrity.delta.toFixed(3)),
        tieout_ok: tieoutOk,
      });
    }

    byProducer.sort((a, b) => b.lb_packout - a.lb_packout);

    const lbDifferenceTotal = Number(byProducer.reduce((s, r) => s + r.lb_difference, 0).toFixed(2));
    const summary = {
      producer_count: byProducer.length,
      receptions_count: byProducer.reduce((s, r) => s + r.receptions_count, 0),
      lb_received_total: Number(byProducer.reduce((s, r) => s + r.lb_received, 0).toFixed(2)),
      lb_rejected_total: Number(byProducer.reduce((s, r) => s + r.lb_rejected, 0).toFixed(2)),
      lb_for_frozen_total: Number(byProducer.reduce((s, r) => s + r.lb_for_frozen, 0).toFixed(2)),
      lb_frozen_to_frozen_total: Number(byProducer.reduce((s, r) => s + r.lb_frozen_to_frozen, 0).toFixed(2)),
      lb_processed_total: Number(byProducer.reduce((s, r) => s + r.lb_processed, 0).toFixed(2)),
      lb_packout_total: Number(byProducer.reduce((s, r) => s + r.lb_packout, 0).toFixed(2)),
      lb_waste_total: Number(byProducer.reduce((s, r) => s + r.lb_waste, 0).toFixed(2)),
      lb_invoiced_total: Number(byProducer.reduce((s, r) => s + r.lb_invoiced, 0).toFixed(2)),
      lb_difference_total: lbDifferenceTotal,
      integrity_ok: integrityFailures.length === 0,
      tieout_ok:
        tieoutFailures.length === 0 &&
        Math.abs(lbDifferenceTotal) <= TIEOUT_LB_SEASON_TOLERANCE,
      by_producer: byProducer,
    };

    let crossCheck: PhysicalBalanceImportResult['cross_check_final_pallet'] = null;
    if (finalPalletBuffer?.length) {
      crossCheck = await this.crossCheckFinalPallet(finalPalletBuffer, summary.lb_packout_total);
    }

    const result: PhysicalBalanceImportResult = {
      season_year: year,
      rows_upserted: rowsUpserted,
      errors,
      integrity_failures: integrityFailures,
      tieout_failures: tieoutFailures,
      cross_check_final_pallet: crossCheck,
      summary,
    };

    if (year === 2025) {
      result.verification_targets_2025 = this.verify2025Targets(summary);
    }
    if (year === 2024) {
      result.verification_targets_2024 = this.verify2024Targets(summary);
    }
    if (year === 2023) {
      result.verification_targets_2023 = this.verify2023Targets(summary);
    }

    await this.importLogRepo.save(
      this.importLogRepo.create({
        username,
        entity_key: 'legacy_mass_balance',
        total_rows: rowsUpserted + errors.length,
        inserted: rowsUpserted,
        skipped: 0,
        errors_count: errors.length + integrityFailures.length + tieoutFailures.length,
        errors_sample: [...errors, ...integrityFailures.map((f) => ({
          message: `Integridad ${f.producer_raw} (${f.mode}): received ${f.lb_received} frozen ${f.lb_for_frozen} vs processed ${f.lb_processed}`,
        }))].slice(0, 25),
      }),
    );

    return result;
  }

  private async parseReceptions(buffer: Buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = pickDataSheet(workbook);
    const headers: string[] = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value ?? '').trim();
    });
    const colMap = mapHeaderRow(headers, RECEPTIONS_COLUMN_ALIASES);
    if (!colMap.has('producer')) {
      throw new BadRequestException('Columna Growers no encontrada en recepciones.');
    }
    if (!colMap.has('quality') || !colMap.has('net_pounds')) {
      throw new BadRequestException('Columnas Quality / Net Pounds no encontradas en recepciones.');
    }
    return aggregateReceptions(sheet, colMap);
  }

  private async parseProcesses(buffer: Buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = pickDataSheet(workbook);
    const headers: string[] = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value ?? '').trim();
    });
    const colMap = mapHeaderRow(headers, PROCESSES_COLUMN_ALIASES);
    if (!colMap.has('producer')) {
      throw new BadRequestException('Columna Growers no encontrada en procesos.');
    }
    if (!colMap.has('lb_processed') || !colMap.has('lb_packout')) {
      throw new BadRequestException('Columnas Lbs. Total / Lbs.Fresh Berries no encontradas en procesos.');
    }
    return aggregateProcesses(sheet, colMap);
  }

  private async crossCheckFinalPallet(buffer: Buffer, physicalPackout: number) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = pickDataSheet(workbook);
    const headers: string[] = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value ?? '').trim();
    });
    const normalized = headers.map((h) => h.trim().toLowerCase().replace(/\s+/g, ' '));
    const poundAliases = ['pound', 'pounds', 'lbs', 'lb', 'net pound', 'net pounds', 'pounds net'];
    const poundsIdx = normalized.findIndex((h) => poundAliases.includes(h));
    let total = 0;
    if (poundsIdx >= 0) {
      for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
        const val = sheet.getRow(rowNum).getCell(poundsIdx + 1).value;
        const s = String(val ?? '').trim().replace(/,/g, '');
        const n = Number(s);
        if (Number.isFinite(n)) total += n;
      }
    }
    return {
      lb_packout_total: Number(total.toFixed(2)),
      delta_vs_physical: Number((total - physicalPackout).toFixed(2)),
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

  private async loadInvoicedPounds(seasonYear: number) {
    const rows = (await this.lineRepo.query(
      `
      SELECT producer_id, COALESCE(SUM(pounds::numeric), 0)::numeric AS lb_invoiced
      FROM season_settlement_lines
      WHERE season_year = $1
      GROUP BY producer_id
      `,
      [seasonYear],
    )) as Array<{ producer_id: string; lb_invoiced: string }>;
    const out = new Map<number, number>();
    for (const r of rows) out.set(Number(r.producer_id), Number(r.lb_invoiced));
    return out;
  }

  private verify2025Targets(summary: PhysicalBalanceImportResult['summary']) {
    const expected = {
      producer_count: 8,
      lb_received_total: 1614123.61,
      lb_rejected_total: 4347.0,
      lb_processed_total: 1614123.61,
      lb_packout_total: 1354617.6,
      lb_waste_total: 258813.01,
      lb_invoiced_total: 1354617.6,
      lb_difference_total: 0,
    };
    const actual = {
      producer_count: summary.producer_count,
      lb_received_total: summary.lb_received_total,
      lb_rejected_total: summary.lb_rejected_total,
      lb_processed_total: summary.lb_processed_total,
      lb_packout_total: summary.lb_packout_total,
      lb_waste_total: summary.lb_waste_total,
      lb_invoiced_total: summary.lb_invoiced_total,
      lb_difference_total: summary.lb_difference_total,
    };
    const close = (a: number, b: number) => Math.abs(a - b) <= LB_TOLERANCE;
    const match =
      actual.producer_count === expected.producer_count &&
      close(actual.lb_received_total, expected.lb_received_total) &&
      close(actual.lb_rejected_total, expected.lb_rejected_total) &&
      close(actual.lb_processed_total, expected.lb_processed_total) &&
      close(actual.lb_packout_total, expected.lb_packout_total) &&
      close(actual.lb_waste_total, expected.lb_waste_total) &&
      close(actual.lb_invoiced_total, expected.lb_invoiced_total) &&
      close(actual.lb_difference_total, expected.lb_difference_total) &&
      summary.integrity_ok &&
      summary.tieout_ok;

    return { expected, actual, match };
  }

  private verify2024Targets(summary: PhysicalBalanceImportResult['summary']) {
    const expected = {
      producer_count: 8,
      lb_received_total: 1626334.84,
      lb_rejected_total: 0,
      lb_processed_total: 1626334.84,
      lb_packout_total: 1442986.4,
      lb_waste_total: 183403.64,
      lb_invoiced_total: 1442986.4,
      lb_difference_total: 0,
    };
    const actual = {
      producer_count: summary.producer_count,
      lb_received_total: summary.lb_received_total,
      lb_rejected_total: summary.lb_rejected_total,
      lb_processed_total: summary.lb_processed_total,
      lb_packout_total: summary.lb_packout_total,
      lb_waste_total: summary.lb_waste_total,
      lb_invoiced_total: summary.lb_invoiced_total,
      lb_difference_total: summary.lb_difference_total,
    };
    const expectedPackoutByProducer: Record<string, number> = {
      'PINEBLOOM FARM': 848456.32,
      'NUBBINTOWN FARMS': 29733.43,
      'JDS FARMS': 140915.1,
      'K & K FARMS': 156669.55,
      JER: 115071.2,
      'FAITH FARMS': 71138.7,
      'RENTZ FARMS': 62777.75,
      'JET FARMS INC': 18224.35,
    };
    const close = (a: number, b: number) => Math.abs(a - b) <= LB_TOLERANCE;
    const packoutByProducer: Record<string, { expected: number; actual: number; match: boolean }> = {};
    let packoutMatch = true;
    for (const [name, exp] of Object.entries(expectedPackoutByProducer)) {
      const row = summary.by_producer.find(
        (p) => normalizeAliasKey(p.producer_raw) === normalizeAliasKey(name),
      );
      const act = row?.lb_packout ?? 0;
      const ok = close(act, exp);
      if (!ok) packoutMatch = false;
      packoutByProducer[name] = { expected: exp, actual: act, match: ok };
    }
    const match =
      actual.producer_count === expected.producer_count &&
      close(actual.lb_received_total, expected.lb_received_total) &&
      close(actual.lb_rejected_total, expected.lb_rejected_total) &&
      close(actual.lb_processed_total, expected.lb_processed_total) &&
      close(actual.lb_packout_total, expected.lb_packout_total) &&
      close(actual.lb_waste_total, expected.lb_waste_total) &&
      close(actual.lb_invoiced_total, expected.lb_invoiced_total) &&
      close(actual.lb_difference_total, expected.lb_difference_total) &&
      summary.integrity_ok &&
      summary.tieout_ok &&
      packoutMatch;

    return { expected, actual, packout_by_producer: packoutByProducer, match };
  }

  private verify2023Targets(summary: PhysicalBalanceImportResult['summary']) {
    const expected = {
      producer_count: 11,
      lb_received_total: 1352801.57,
      lb_for_frozen_total: 84994.05,
      lb_processed_total: 1359898.57,
      lb_packout_total: 1254918.64,
      lb_waste_total: 105256.93,
      lb_invoiced_total: 1254884.69,
      lb_difference_total: 33.95,
      lb_frozen_to_frozen_total: 76567.05 + 1330.0,
    };
    const actual = {
      producer_count: summary.producer_count,
      lb_received_total: summary.lb_received_total,
      lb_for_frozen_total: summary.lb_for_frozen_total,
      lb_processed_total: summary.lb_processed_total,
      lb_packout_total: summary.lb_packout_total,
      lb_waste_total: summary.lb_waste_total,
      lb_invoiced_total: summary.lb_invoiced_total,
      lb_difference_total: summary.lb_difference_total,
      lb_frozen_to_frozen_total: summary.lb_frozen_to_frozen_total,
    };
    const expectedByProducer: Record<string, Record<string, number>> = {
      'PINEBLOOM FARM': {
        receptions_count: 64,
        lb_received: 680872.62,
        lb_for_frozen: 83664.05,
        lb_processed: 687969.62,
        lb_packout: 634388.4,
        lb_waste: 53580.97,
        pct_packout: 92.2,
        lb_frozen_to_frozen: 76567.05,
      },
      'JDS FARMS': {
        receptions_count: 30,
        lb_received: 214270.3,
        lb_for_frozen: 0,
        lb_processed: 214270.3,
        lb_packout: 201957.75,
        lb_waste: 12331.05,
        pct_packout: 94.3,
        lb_frozen_to_frozen: 0,
      },
      'RENTZ FARMS': {
        receptions_count: 13,
        lb_received: 96348.05,
        lb_for_frozen: 0,
        lb_processed: 96348.05,
        lb_packout: 88318.6,
        lb_waste: 8288.2,
        pct_packout: 91.7,
        lb_frozen_to_frozen: 0,
      },
      JER: {
        receptions_count: 12,
        lb_received: 79275,
        lb_for_frozen: 0,
        lb_processed: 79275,
        lb_packout: 72940,
        lb_waste: 6335,
        pct_packout: 92.0,
        lb_frozen_to_frozen: 0,
      },
      'RIVERVIEW PLANTATION': {
        receptions_count: 9,
        lb_received: 54214.85,
        lb_for_frozen: 0,
        lb_processed: 54214.85,
        lb_packout: 50522.35,
        lb_waste: 3692.5,
        pct_packout: 93.2,
        lb_frozen_to_frozen: 0,
      },
      'FAITH FARMS': {
        receptions_count: 10,
        lb_received: 55891.35,
        lb_for_frozen: 0,
        lb_processed: 55891.35,
        lb_packout: 49125.55,
        lb_waste: 6765.8,
        pct_packout: 87.9,
        lb_frozen_to_frozen: 0,
      },
      'JIMMY WEBB': {
        receptions_count: 15,
        lb_received: 53397.55,
        lb_for_frozen: 1330,
        lb_processed: 53397.55,
        lb_packout: 47858.19,
        lb_waste: 5539.36,
        pct_packout: 89.6,
        lb_frozen_to_frozen: 1330,
      },
      'NUBBINTOWN FARMS': {
        receptions_count: 9,
        lb_received: 45105,
        lb_for_frozen: 0,
        lb_processed: 45105,
        lb_packout: 40808.3,
        lb_waste: 4296.7,
        pct_packout: 90.5,
        lb_frozen_to_frozen: 0,
      },
      'K & K FARMS': {
        receptions_count: 8,
        lb_received: 38884.45,
        lb_for_frozen: 0,
        lb_processed: 38884.45,
        lb_packout: 36811.55,
        lb_waste: 2072.9,
        pct_packout: 94.7,
        lb_frozen_to_frozen: 0,
      },
      'JET FARMS INC': {
        receptions_count: 11,
        lb_received: 33414.4,
        lb_for_frozen: 0,
        lb_processed: 33414.4,
        lb_packout: 31188.95,
        lb_waste: 2225.45,
        pct_packout: 93.3,
        lb_frozen_to_frozen: 0,
      },
      'LOST CREEK FARMS': {
        receptions_count: 1,
        lb_received: 1128,
        lb_for_frozen: 0,
        lb_processed: 1128,
        lb_packout: 999,
        lb_waste: 129,
        pct_packout: 88.6,
        lb_frozen_to_frozen: 0,
      },
    };
    const close = (a: number, b: number) => Math.abs(a - b) <= LB_TOLERANCE;
    const closePct = (a: number, b: number) => Math.abs(a - b) <= 0.15;
    const byProducer: Record<string, { expected: Record<string, number>; actual: Record<string, number>; match: boolean }> =
      {};
    let producerMatch = true;
    for (const [name, exp] of Object.entries(expectedByProducer)) {
      const row = summary.by_producer.find(
        (p) => normalizeAliasKey(p.producer_raw) === normalizeAliasKey(name),
      );
      const act = row
        ? {
            receptions_count: row.receptions_count,
            lb_received: row.lb_received,
            lb_for_frozen: row.lb_for_frozen,
            lb_processed: row.lb_processed,
            lb_packout: row.lb_packout,
            lb_waste: row.lb_waste,
            pct_packout: row.pct_packout,
            lb_frozen_to_frozen: row.lb_frozen_to_frozen,
          }
        : {};
      const ok =
        row != null &&
        row.integrity_ok &&
        row.tieout_ok &&
        row.receptions_count === exp.receptions_count &&
        close(act.lb_received!, exp.lb_received) &&
        close(act.lb_for_frozen!, exp.lb_for_frozen) &&
        close(act.lb_processed!, exp.lb_processed) &&
        close(act.lb_packout!, exp.lb_packout) &&
        close(act.lb_waste!, exp.lb_waste) &&
        closePct(act.pct_packout!, exp.pct_packout) &&
        close(act.lb_frozen_to_frozen!, exp.lb_frozen_to_frozen);
      if (!ok) producerMatch = false;
      byProducer[name] = { expected: exp, actual: act, match: ok };
    }
    const match =
      actual.producer_count === expected.producer_count &&
      close(actual.lb_received_total, expected.lb_received_total) &&
      close(actual.lb_for_frozen_total, expected.lb_for_frozen_total) &&
      close(actual.lb_processed_total, expected.lb_processed_total) &&
      close(actual.lb_packout_total, expected.lb_packout_total) &&
      close(actual.lb_waste_total, expected.lb_waste_total) &&
      close(actual.lb_invoiced_total, expected.lb_invoiced_total) &&
      close(actual.lb_difference_total, expected.lb_difference_total) &&
      close(actual.lb_frozen_to_frozen_total, expected.lb_frozen_to_frozen_total) &&
      summary.integrity_ok &&
      summary.tieout_ok &&
      producerMatch;

    return { expected, actual, by_producer: byProducer, match };
  }

  async getMassBalanceSummary(year: number) {
    const rows = await this.massBalanceRepo.find({
      where: { season_year: year },
      order: { lb_packout: 'DESC' },
    });
    return { season_year: year, rows };
  }
}

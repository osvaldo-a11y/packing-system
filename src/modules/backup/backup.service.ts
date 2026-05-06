import { Injectable } from '@nestjs/common';
import { ImportEntityKey } from '../import/import-template.service';
import { ImportService } from '../import/import.service';

@Injectable()
export class BackupService {
  constructor(private readonly importService: ImportService) {}

  async buildFullBackupPayload() {
    const entities: Array<{ key: ImportEntityKey; file: string }> = [
      { key: 'receptions', file: 'backup_receptions.csv' },
      { key: 'processes', file: 'backup_processes.csv' },
      { key: 'pt-tags', file: 'backup_pt_tags.csv' },
      { key: 'final-pallets', file: 'backup_final_pallets.csv' },
      { key: 'sales-orders', file: 'backup_sales_orders.csv' },
      { key: 'dispatches', file: 'backup_dispatches.csv' },
    ];

    const csvs: Array<{ file: string; body: string }> = [];
    for (const ent of entities) {
      const out = await this.importService.buildExportCsv(ent.key);
      csvs.push({ file: ent.file, body: out.body });
    }

    const counts = await this.importService.getEntityCounts();
    return { csvs, counts };
  }
}


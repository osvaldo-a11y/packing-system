import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportLog } from '../import/import-log.entity';
import { ReportSnapshot } from '../reporting/reporting.entities';
import { ReportingModule } from '../reporting/reporting.module';
import { Brand } from '../traceability/operational.entities';
import { Producer, Variety } from '../traceability/traceability.entities';
import { FinalChargeImportService } from './final-charge-import.service';
import { LegacyValueAlias, SeasonMassBalance, SeasonSettlementLine } from './legacy.entities';
import { Season } from './season.entity';
import { SeasonsController } from './seasons.controller';
import { SeasonsService } from './seasons.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Season,
      ReportSnapshot,
      LegacyValueAlias,
      SeasonSettlementLine,
      SeasonMassBalance,
      Producer,
      Brand,
      Variety,
      ImportLog,
    ]),
    ReportingModule,
  ],
  controllers: [SeasonsController],
  providers: [SeasonsService, FinalChargeImportService],
  exports: [SeasonsService, FinalChargeImportService],
})
export class SeasonsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportLog } from '../import/import-log.entity';
import { ReportSnapshot } from '../reporting/reporting.entities';
import { PlantModule } from '../plant/plant.module';
import { ReportingModule } from '../reporting/reporting.module';
import { Brand } from '../traceability/operational.entities';
import { Producer, Variety } from '../traceability/traceability.entities';
import { FinalChargeImportService } from './final-charge-import.service';
import { PhysicalBalanceImportService } from './physical-balance-import.service';
import { PhysicalLinesImportService } from './physical-lines-import.service';
import {
  LegacyValueAlias,
  SeasonMassBalance,
  SeasonProcessLine,
  SeasonReceptionLine,
  SeasonSettlementLine,
} from './legacy.entities';
import { Season } from './season.entity';
import { SeasonExportService } from './season-export.service';
import { SeasonReadService } from './season-read.service';
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
      SeasonReceptionLine,
      SeasonProcessLine,
      Producer,
      Brand,
      Variety,
      ImportLog,
    ]),
    ReportingModule,
    PlantModule,
  ],
  controllers: [SeasonsController],
  providers: [
    SeasonsService,
    SeasonReadService,
    SeasonExportService,
    FinalChargeImportService,
    PhysicalBalanceImportService,
    PhysicalLinesImportService,
  ],
  exports: [
    SeasonsService,
    SeasonReadService,
    SeasonExportService,
    FinalChargeImportService,
    PhysicalBalanceImportService,
    PhysicalLinesImportService,
  ],
})
export class SeasonsModule {}

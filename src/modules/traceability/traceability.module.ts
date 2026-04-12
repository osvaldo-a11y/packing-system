import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MastersController } from './masters.controller';
import { ReceptionController } from './reception.controller';
import { TraceabilityDashboardController } from './traceability-dashboard.controller';
import { TraceabilityDashboardService } from './traceability-dashboard.service';
import { RawMaterialMovement } from '../process/process.entities';
import { PackagingMaterial } from '../packaging/packaging.entities';
import { DocumentState, MaterialCategory, Mercado, ReceptionType } from './catalog.entities';
import {
  Brand,
  Client,
  FinishedPtStock,
  PackingMaterialSupplier,
  PackingSupplier,
  ReturnableContainer,
} from './operational.entities';
import {
  PresentationFormat,
  ProcessResultComponent,
  ProcessMachine,
  Producer,
  QualityGrade,
  Reception,
  ReceptionLine,
  SpeciesProcessResultComponent,
  Species,
  Variety,
} from './traceability.entities';
import { MasterUsageService } from './master-usage.service';
import { OperationalService } from './operational.service';
import { TraceabilityService } from './traceability.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Species,
      Producer,
      Variety,
      PresentationFormat,
      Reception,
      ReceptionLine,
      QualityGrade,
      ProcessMachine,
      ProcessResultComponent,
      SpeciesProcessResultComponent,
      RawMaterialMovement,
      Client,
      Brand,
      PackingSupplier,
      PackingMaterialSupplier,
      ReturnableContainer,
      FinishedPtStock,
      PackagingMaterial,
      Mercado,
      MaterialCategory,
      ReceptionType,
      DocumentState,
    ]),
  ],
  controllers: [MastersController, ReceptionController, TraceabilityDashboardController],
  providers: [TraceabilityService, TraceabilityDashboardService, OperationalService, MasterUsageService],
  exports: [TypeOrmModule, TraceabilityService, OperationalService, MasterUsageService],
})
export class TraceabilityModule {}

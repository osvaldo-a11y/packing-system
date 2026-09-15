import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MastersController } from './masters.controller';
import { ReceptionController } from './reception.controller';
import { TraceabilityDashboardController } from './traceability-dashboard.controller';
import { TraceabilityDashboardService } from './traceability-dashboard.service';
import { RawMaterialMovement, FruitProcessLineAllocation } from '../process/process.entities';
import { PackagingMaterial } from '../packaging/packaging.entities';
import { DocumentState, MaterialCategory, Mercado, ReceptionType } from './catalog.entities';
import {
  Brand,
  Client,
  FinishedPtStock,
  PackingMaterialSupplier,
  PackingSupplier,
  PackingSupplierMaterialCategory,
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
import { MasterForceDeleteService } from './master-force-delete.service';
import { OperationalService } from './operational.service';
import { TraceabilityService } from './traceability.service';
import { RawInventoryService } from './raw-inventory.service';
import {
  Dispatch,
  ReceptionLineDirectAllocation,
  ReceptionLineAdjustment,
} from '../dispatch/dispatch.entities';

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
      FruitProcessLineAllocation,
      ReceptionLineDirectAllocation,
      ReceptionLineAdjustment,
      Dispatch,
      Client,
      Brand,
      PackingSupplier,
      PackingSupplierMaterialCategory,
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
  providers: [
    TraceabilityService,
    TraceabilityDashboardService,
    OperationalService,
    MasterUsageService,
    MasterForceDeleteService,
    RawInventoryService,
  ],
  exports: [
    TypeOrmModule,
    TraceabilityService,
    OperationalService,
    MasterUsageService,
    MasterForceDeleteService,
    RawInventoryService,
  ],
})
export class TraceabilityModule {}

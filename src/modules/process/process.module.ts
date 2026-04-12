import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinishedPtStock } from '../traceability/operational.entities';
import {
  PresentationFormat,
  ProcessMachine,
  ReceptionLine,
  SpeciesProcessResultComponent,
} from '../traceability/traceability.entities';
import { TraceabilityModule } from '../traceability/traceability.module';
import { FinalPalletModule } from '../final-pallet/final-pallet.module';
import { FinalPallet, FinalPalletLine } from '../final-pallet/final-pallet.entities';
import { ProcessController } from './process.controller';
import {
  FruitProcess,
  FruitProcessComponentValue,
  FruitProcessLineAllocation,
  PtTag,
  PtTagAudit,
  PtTagItem,
  PtTagLineage,
  PtTagMerge,
  PtTagMergeSource,
  RawMaterialMovement,
} from './process.entities';
import { ProcessService } from './process.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FruitProcess,
      FruitProcessComponentValue,
      FruitProcessLineAllocation,
      RawMaterialMovement,
      PtTag,
      PtTagItem,
      PtTagAudit,
      PtTagMerge,
      PtTagMergeSource,
      PtTagLineage,
      PresentationFormat,
      ProcessMachine,
      ReceptionLine,
      SpeciesProcessResultComponent,
      FinishedPtStock,
      FinalPallet,
      FinalPalletLine,
    ]),
    TraceabilityModule,
    FinalPalletModule,
  ],
  controllers: [ProcessController],
  providers: [ProcessService],
  exports: [ProcessService],
})
export class ProcessModule {}

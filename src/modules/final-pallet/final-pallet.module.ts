import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dispatch, SalesOrder } from '../dispatch/dispatch.entities';
import { PackagingMaterial } from '../packaging/packaging.entities';
import {
  FruitProcess,
  FruitProcessLineAllocation,
  PtTag,
  PtTagItem,
  PtTagMerge,
  PtTagMergeSource,
} from '../process/process.entities';
import { Brand, Client } from '../traceability/operational.entities';
import { PresentationFormat, QualityGrade, Species, Variety } from '../traceability/traceability.entities';
import { FinishedPtStock } from '../traceability/operational.entities';
import { FinalPalletController } from './final-pallet.controller';
import { FinalPallet, FinalPalletLine } from './final-pallet.entities';
import { FinishedPtInventory } from './finished-pt-inventory.entity';
import { RepalletEvent, RepalletLineProvenance, RepalletReversal, RepalletSource } from './repallet.entities';
import { FinalPalletService } from './final-pallet.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FinalPallet,
      FinalPalletLine,
      RepalletEvent,
      RepalletReversal,
      RepalletSource,
      RepalletLineProvenance,
      FinishedPtInventory,
      FinishedPtStock,
      FruitProcess,
      FruitProcessLineAllocation,
      PtTag,
      PtTagItem,
      PtTagMerge,
      PtTagMergeSource,
      Client,
      Brand,
      PackagingMaterial,
      PresentationFormat,
      Variety,
      Species,
      QualityGrade,
      Dispatch,
      SalesOrder,
    ]),
  ],
  controllers: [FinalPalletController],
  providers: [FinalPalletService],
  exports: [FinalPalletService],
})
export class FinalPalletModule {}

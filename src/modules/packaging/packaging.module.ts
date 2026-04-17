import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PtTag } from '../process/process.entities';
import { MaterialCategory } from '../traceability/catalog.entities';
import { Brand, Client } from '../traceability/operational.entities';
import { PresentationFormat } from '../traceability/traceability.entities';
import {
  PackagingCostBreakdown,
  PackagingMaterial,
  PackagingMaterialMovement,
  PackagingPalletConsumption,
  PackagingRecipe,
  PackagingRecipeItem,
} from './packaging.entities';
import { PackagingController } from './packaging.controller';
import { PackagingService } from './packaging.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MaterialCategory,
      PtTag,
      Brand,
      Client,
      PresentationFormat,
      PackagingMaterial,
      PackagingRecipe,
      PackagingRecipeItem,
      PackagingPalletConsumption,
      PackagingCostBreakdown,
      PackagingMaterialMovement,
    ]),
  ],
  controllers: [PackagingController],
  providers: [PackagingService],
})
export class PackagingModule {}

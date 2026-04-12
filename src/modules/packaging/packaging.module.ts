import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialCategory } from '../traceability/catalog.entities';
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

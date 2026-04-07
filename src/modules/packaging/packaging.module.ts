import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PackagingCostBreakdown,
  PackagingMaterial,
  PackagingPalletConsumption,
  PackagingRecipe,
  PackagingRecipeItem,
} from './packaging.entities';
import { PackagingController } from './packaging.controller';
import { PackagingService } from './packaging.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PackagingMaterial,
      PackagingRecipe,
      PackagingRecipeItem,
      PackagingPalletConsumption,
      PackagingCostBreakdown,
    ]),
  ],
  controllers: [PackagingController],
  providers: [PackagingService],
})
export class PackagingModule {}

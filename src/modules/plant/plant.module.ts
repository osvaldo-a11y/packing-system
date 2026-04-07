import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlantController } from './plant.controller';
import { PlantSettings } from './plant.entities';
import { PlantService } from './plant.service';

@Module({
  imports: [TypeOrmModule.forFeature([PlantSettings])],
  controllers: [PlantController],
  providers: [PlantService],
  exports: [PlantService],
})
export class PlantModule {}

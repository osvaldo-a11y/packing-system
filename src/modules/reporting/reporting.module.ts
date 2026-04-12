import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessModule } from '../process/process.module';
import { PlantModule } from '../plant/plant.module';
import { ReportSnapshot, PackingCost } from './reporting.entities';
import { ReportingExportService } from './reporting-export.service';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';

@Module({
  imports: [TypeOrmModule.forFeature([ReportSnapshot, PackingCost]), PlantModule, ProcessModule],
  controllers: [ReportingController],
  providers: [ReportingService, ReportingExportService],
})
export class ReportingModule {}

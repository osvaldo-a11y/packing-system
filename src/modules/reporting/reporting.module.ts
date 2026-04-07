import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlantModule } from '../plant/plant.module';
import { ReportSnapshot } from './reporting.entities';
import { ReportingExportService } from './reporting-export.service';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';

@Module({
  imports: [TypeOrmModule.forFeature([ReportSnapshot]), PlantModule],
  controllers: [ReportingController],
  providers: [ReportingService, ReportingExportService],
})
export class ReportingModule {}

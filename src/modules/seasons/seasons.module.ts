import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportSnapshot } from '../reporting/reporting.entities';
import { ReportingModule } from '../reporting/reporting.module';
import { Season } from './season.entity';
import { SeasonsController } from './seasons.controller';
import { SeasonsService } from './seasons.service';

@Module({
  imports: [TypeOrmModule.forFeature([Season, ReportSnapshot]), ReportingModule],
  controllers: [SeasonsController],
  providers: [SeasonsService],
  exports: [SeasonsService],
})
export class SeasonsModule {}

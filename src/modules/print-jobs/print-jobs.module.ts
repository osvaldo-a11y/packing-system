import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PrintJob } from './print-job.entity';
import { PrintAgentGuard } from './print-agent.guard';
import { PrintJobsController } from './print-jobs.controller';
import { PrintJobsService } from './print-jobs.service';

@Module({
  imports: [TypeOrmModule.forFeature([PrintJob])],
  controllers: [PrintJobsController],
  providers: [PrintJobsService, PrintAgentGuard],
  exports: [PrintJobsService],
})
export class PrintJobsModule {}

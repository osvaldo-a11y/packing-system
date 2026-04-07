import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessController } from './process.controller';
import { FruitProcess, PtTag, PtTagAudit, PtTagItem } from './process.entities';
import { ProcessService } from './process.service';

@Module({
  imports: [TypeOrmModule.forFeature([FruitProcess, PtTag, PtTagItem, PtTagAudit])],
  controllers: [ProcessController],
  providers: [ProcessService],
  exports: [ProcessService],
})
export class ProcessModule {}

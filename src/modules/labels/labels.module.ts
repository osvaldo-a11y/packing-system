import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesOrder } from '../dispatch/dispatch.entities';
import { FinalPallet } from '../final-pallet/final-pallet.entities';
import { FruitProcess, PtTag, PtTagItem } from '../process/process.entities';
import { PtPackingList } from '../pt-packing-list/pt-packing-list.entities';
import { PresentationFormat, Producer, Variety } from '../traceability/traceability.entities';
import { LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PtTag,
      PtTagItem,
      FruitProcess,
      Producer,
      Variety,
      PresentationFormat,
      FinalPallet,
      PtPackingList,
      SalesOrder,
    ]),
  ],
  controllers: [LabelsController],
  providers: [LabelsService],
})
export class LabelsModule {}

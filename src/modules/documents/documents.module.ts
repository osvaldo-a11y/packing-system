import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Dispatch,
  DispatchPtPackingList,
  DispatchTagItem,
  Invoice,
  InvoiceItem,
  PackingList,
} from '../dispatch/dispatch.entities';
import { FinalPallet, FinalPalletLine } from '../final-pallet/final-pallet.entities';
import { RepalletEvent } from '../final-pallet/repallet.entities';
import { FruitProcess, PtTag, PtTagItem } from '../process/process.entities';
import { PtPackingList } from '../pt-packing-list/pt-packing-list.entities';
import { Client } from '../traceability/operational.entities';
import { Producer, Variety } from '../traceability/traceability.entities';
import { FinalPalletModule } from '../final-pallet/final-pallet.module';
import { PlantModule } from '../plant/plant.module';
import { ProcessModule } from '../process/process.module';
import { TraceabilityModule } from '../traceability/traceability.module';
import { DocumentsController } from './documents.controller';
import { DocumentsPdfService } from './documents-pdf.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FruitProcess,
      PtTag,
      PtTagItem,
      Dispatch,
      DispatchPtPackingList,
      DispatchTagItem,
      Client,
      Producer,
      Variety,
      PackingList,
      Invoice,
      InvoiceItem,
      PtPackingList,
      FinalPallet,
      FinalPalletLine,
      RepalletEvent,
    ]),
    TraceabilityModule,
    ProcessModule,
    FinalPalletModule,
    PlantModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsPdfService],
})
export class DocumentsModule {}

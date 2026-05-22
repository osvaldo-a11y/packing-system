import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Dispatch,
  DispatchPtPackingList,
  DispatchTagItem,
  Invoice,
  InvoiceItem,
  PackingList,
  SalesOrder,
} from '../dispatch/dispatch.entities';
import { FinalPallet, FinalPalletLine } from '../final-pallet/final-pallet.entities';
import { Client } from '../traceability/operational.entities';
import { FinalPalletModule } from '../final-pallet/final-pallet.module';
import { PtPackingListController } from './pt-packing-list.controller';
import { PtPackingList, PtPackingListItem, PtPackingListReversalEvent } from './pt-packing-list.entities';
import { PtPackingListService } from './pt-packing-list.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PtPackingList,
      PtPackingListItem,
      PtPackingListReversalEvent,
      DispatchPtPackingList,
      Dispatch,
      DispatchTagItem,
      Invoice,
      InvoiceItem,
      PackingList,
      SalesOrder,
      FinalPallet,
      FinalPalletLine,
      Client,
    ]),
    FinalPalletModule,
  ],
  controllers: [PtPackingListController],
  providers: [PtPackingListService],
})
export class PtPackingListModule {}

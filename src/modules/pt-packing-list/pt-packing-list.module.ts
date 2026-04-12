import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dispatch, DispatchPtPackingList, SalesOrder } from '../dispatch/dispatch.entities';
import { FinalPallet, FinalPalletLine } from '../final-pallet/final-pallet.entities';
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
      SalesOrder,
      FinalPallet,
      FinalPalletLine,
    ]),
    FinalPalletModule,
  ],
  controllers: [PtPackingListController],
  providers: [PtPackingListService],
})
export class PtPackingListModule {}

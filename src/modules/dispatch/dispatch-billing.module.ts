import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinalPalletModule } from '../final-pallet/final-pallet.module';
import { FinalPallet, FinalPalletLine } from '../final-pallet/final-pallet.entities';
import { FinishedPtInventory } from '../final-pallet/finished-pt-inventory.entity';
import { DispatchBillingController } from './dispatch-billing.controller';
import { FruitProcess, PtTag, PtTagItem } from '../process/process.entities';
import { Brand, Client, FinishedPtStock } from '../traceability/operational.entities';
import { PresentationFormat, Species, Variety } from '../traceability/traceability.entities';
import { TraceabilityModule } from '../traceability/traceability.module';
import {
  Dispatch,
  DispatchPtPackingList,
  DispatchReceptionLine,
  DispatchTagItem,
  Invoice,
  InvoiceItem,
  PackingList,
  ReceptionLineDirectAllocation,
  SalesOrder,
  SalesOrderLine,
  SalesOrderModification,
} from './dispatch.entities';
import { PtPackingList, PtPackingListItem, PtPackingListReversalEvent } from '../pt-packing-list/pt-packing-list.entities';
import { DispatchBillingService } from './dispatch-billing.service';
import { SalesOrderProgressService } from './sales-order-progress.service';

@Module({
  imports: [
    FinalPalletModule,
    TraceabilityModule,
    TypeOrmModule.forFeature([
      SalesOrder,
      SalesOrderLine,
      SalesOrderModification,
      Brand,
      Client,
      Variety,
      Species,
      Dispatch,
      DispatchPtPackingList,
      DispatchReceptionLine,
      ReceptionLineDirectAllocation,
      PtPackingList,
      PtPackingListItem,
      DispatchTagItem,
      PackingList,
      Invoice,
      InvoiceItem,
      PtTag,
      PtTagItem,
      FinishedPtStock,
      FinishedPtInventory,
      FinalPallet,
      FinalPalletLine,
      PtPackingListReversalEvent,
      PresentationFormat,
      FruitProcess,
    ]),
  ],
  controllers: [DispatchBillingController],
  providers: [DispatchBillingService, SalesOrderProgressService],
  exports: [DispatchBillingService],
})
export class DispatchBillingModule {}

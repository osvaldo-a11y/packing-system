import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispatchBillingController } from './dispatch-billing.controller';
import { Dispatch, DispatchTagItem, Invoice, InvoiceItem, PackingList, SalesOrder, SalesOrderModification } from './dispatch.entities';
import { DispatchBillingService } from './dispatch-billing.service';

@Module({
  imports: [TypeOrmModule.forFeature([SalesOrder, SalesOrderModification, Dispatch, DispatchTagItem, PackingList, Invoice, InvoiceItem])],
  controllers: [DispatchBillingController],
  providers: [DispatchBillingService],
})
export class DispatchBillingModule {}

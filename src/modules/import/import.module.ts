import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentState, Mercado, ReceptionType } from '../traceability/catalog.entities';
import { TraceabilityModule } from '../traceability/traceability.module';
import { ProcessModule } from '../process/process.module';
import { DispatchBillingModule } from '../dispatch/dispatch-billing.module';
import {
  Dispatch,
  DispatchPtPackingList,
  DispatchTagItem,
  Invoice,
  InvoiceItem,
  PackingList,
  SalesOrder,
  SalesOrderLine,
  SalesOrderModification,
} from '../dispatch/dispatch.entities';
import { FinalPallet } from '../final-pallet/final-pallet.entities';
import { FruitProcess, PtTag, PtTagItem, RawMaterialMovement } from '../process/process.entities';
import {
  PresentationFormat,
  ProcessMachine,
  Producer,
  QualityGrade,
  Reception,
  ReceptionLine,
  Species,
  Variety,
} from '../traceability/traceability.entities';
import { Brand, Client, ReturnableContainer } from '../traceability/operational.entities';
import { ImportController } from './import.controller';
import { ImportLog } from './import-log.entity';
import { ImportService } from './import.service';
import { ImportTemplateService } from './import-template.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ImportLog,
      DocumentState,
      ReceptionType,
      Mercado,
      SalesOrder,
      SalesOrderLine,
      SalesOrderModification,
      Dispatch,
      DispatchTagItem,
      DispatchPtPackingList,
      PackingList,
      Invoice,
      InvoiceItem,
      FinalPallet,
      FruitProcess,
      PtTag,
      PtTagItem,
      RawMaterialMovement,
      Reception,
      ReceptionLine,
      Producer,
      Species,
      Variety,
      ProcessMachine,
      QualityGrade,
      ReturnableContainer,
      PresentationFormat,
      Client,
      Brand,
    ]),
    TraceabilityModule,
    ProcessModule,
    DispatchBillingModule,
  ],
  controllers: [ImportController],
  providers: [ImportService, ImportTemplateService],
  exports: [ImportService, ImportTemplateService],
})
export class ImportModule {}

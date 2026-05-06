import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
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
} from '../modules/dispatch/dispatch.entities';
import {
  FruitProcess,
  FruitProcessComponentValue,
  FruitProcessLineAllocation,
  PtTag,
  PtTagAudit,
  PtTagItem,
  PtTagLineage,
  PtTagMerge,
  PtTagMergeSource,
  RawMaterialMovement,
} from '../modules/process/process.entities';
import { FinalPallet, FinalPalletLine } from '../modules/final-pallet/final-pallet.entities';
import { PtPackingList, PtPackingListItem, PtPackingListReversalEvent } from '../modules/pt-packing-list/pt-packing-list.entities';
import { FinishedPtInventory } from '../modules/final-pallet/finished-pt-inventory.entity';
import {
  RepalletEvent,
  RepalletLineProvenance,
  RepalletReversal,
  RepalletSource,
} from '../modules/final-pallet/repallet.entities';
import {
  PackagingCostBreakdown,
  PackagingMaterial,
  PackagingMaterialMovement,
  PackagingPalletConsumption,
  PackagingRecipe,
  PackagingRecipeItem,
} from '../modules/packaging/packaging.entities';
import { PackingCost, ReportSnapshot } from '../modules/reporting/reporting.entities';
import { PlantSettings } from '../modules/plant/plant.entities';
import { ImportLog } from '../modules/import/import-log.entity';
import {
  Brand,
  Client,
  FinishedPtStock,
  PackingMaterialSupplier,
  PackingSupplier,
  ReturnableContainer,
} from '../modules/traceability/operational.entities';
import {
  DocumentState,
  MaterialCategory,
  Mercado,
  ReceptionType,
} from '../modules/traceability/catalog.entities';
import {
  PresentationFormat,
  ProcessResultComponent,
  ProcessMachine,
  Producer,
  QualityGrade,
  Reception,
  ReceptionLine,
  SpeciesProcessResultComponent,
  Species,
  Variety,
} from '../modules/traceability/traceability.entities';

const entities = [
  Mercado,
  MaterialCategory,
  ReceptionType,
  DocumentState,
  Client,
  Brand,
  PackingSupplier,
  PackingMaterialSupplier,
  ReturnableContainer,
  FinishedPtStock,
  FruitProcess,
  FruitProcessComponentValue,
  FruitProcessLineAllocation,
  RawMaterialMovement,
  PtTag,
  PtTagMerge,
  PtTagMergeSource,
  PtTagLineage,
  PtTagItem,
  PtTagAudit,
  SalesOrder,
  SalesOrderLine,
  SalesOrderModification,
  Dispatch,
  DispatchPtPackingList,
  DispatchTagItem,
  PackingList,
  Invoice,
  InvoiceItem,
  PackagingMaterial,
  PackagingRecipe,
  PackagingRecipeItem,
  PackagingPalletConsumption,
  PackagingCostBreakdown,
  PackagingMaterialMovement,
  FinalPallet,
  FinalPalletLine,
  PtPackingList,
  PtPackingListItem,
  PtPackingListReversalEvent,
  RepalletEvent,
  RepalletReversal,
  RepalletSource,
  RepalletLineProvenance,
  FinishedPtInventory,
  ReportSnapshot,
  PackingCost,
  PlantSettings,
  ImportLog,
  Species,
  Producer,
  Variety,
  PresentationFormat,
  Reception,
  ReceptionLine,
  QualityGrade,
  ProcessMachine,
  ProcessResultComponent,
  SpeciesProcessResultComponent,
];

const url = process.env.DATABASE_URL;

const migrations =
  process.env.NODE_ENV === 'production'
    ? ['dist/database/migrations/*.js']
    : ['src/database/migrations/*.ts'];

export default new DataSource(
  url
    ? {
        type: 'postgres',
        url,
        ssl:
          process.env.DB_SSL_DISABLED === 'true'
            ? false
            : {
                rejectUnauthorized: false,
              },
        entities,
        migrations,
      }
    : {
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASS || 'postgres',
        database: process.env.DB_NAME || 'packing_system',
        entities,
        migrations,
      },
);

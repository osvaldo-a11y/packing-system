import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Dispatch, DispatchTagItem, Invoice, InvoiceItem, PackingList, SalesOrder, SalesOrderModification } from '../modules/dispatch/dispatch.entities';
import { FruitProcess, PtTag, PtTagAudit, PtTagItem } from '../modules/process/process.entities';
import {
  PackagingCostBreakdown,
  PackagingMaterial,
  PackagingPalletConsumption,
  PackagingRecipe,
  PackagingRecipeItem,
} from '../modules/packaging/packaging.entities';
import { ReportSnapshot } from '../modules/reporting/reporting.entities';
import { PlantSettings } from '../modules/plant/plant.entities';

const entities = [
  FruitProcess,
  PtTag,
  PtTagItem,
  PtTagAudit,
  SalesOrder,
  SalesOrderModification,
  Dispatch,
  DispatchTagItem,
  PackingList,
  Invoice,
  InvoiceItem,
  PackagingMaterial,
  PackagingRecipe,
  PackagingRecipeItem,
  PackagingPalletConsumption,
  PackagingCostBreakdown,
  ReportSnapshot,
  PlantSettings,
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

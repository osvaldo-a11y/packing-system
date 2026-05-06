import { existsSync } from 'fs';
import { join } from 'path';
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getTypeOrmModuleOptions } from './database/database.config';
import { AuthModule } from './modules/auth/auth.module';
import { ProcessModule } from './modules/process/process.module';
import { DispatchBillingModule } from './modules/dispatch/dispatch-billing.module';
import { PackagingModule } from './modules/packaging/packaging.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { PlantModule } from './modules/plant/plant.module';
import { TraceabilityModule } from './modules/traceability/traceability.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ImportModule } from './modules/import/import.module';
import { BackupModule } from './modules/backup/backup.module';
import { FinalPalletModule } from './modules/final-pallet/final-pallet.module';
import { PtPackingListModule } from './modules/pt-packing-list/pt-packing-list.module';

const webIndex = join(process.cwd(), 'frontend', 'dist', 'index.html');
const webImports = existsSync(webIndex)
  ? [
      ServeStaticModule.forRoot({
        rootPath: join(process.cwd(), 'frontend', 'dist'),
        exclude: ['/api*'],
      }),
    ]
  : [];

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 10_000 }],
    }),
    AuthModule,
    TypeOrmModule.forRoot(getTypeOrmModuleOptions()),
    TraceabilityModule,
    ProcessModule,
    DispatchBillingModule,
    FinalPalletModule,
    PtPackingListModule,
    PackagingModule,
    PlantModule,
    ReportingModule,
    DocumentsModule,
    ImportModule,
    BackupModule,
    ...webImports,
  ],
})
export class AppModule {}

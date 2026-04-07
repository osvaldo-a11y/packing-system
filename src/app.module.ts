import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getTypeOrmModuleOptions } from './database/database.config';
import { AuthModule } from './modules/auth/auth.module';
import { ProcessModule } from './modules/process/process.module';
import { DispatchBillingModule } from './modules/dispatch/dispatch-billing.module';
import { PackagingModule } from './modules/packaging/packaging.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { PlantModule } from './modules/plant/plant.module';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forRoot(getTypeOrmModuleOptions()),
    ProcessModule,
    DispatchBillingModule,
    PackagingModule,
    PlantModule,
    ReportingModule,
  ],
})
export class AppModule {}

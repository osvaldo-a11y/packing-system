import { Module } from '@nestjs/common';
import { ImportModule } from '../import/import.module';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

@Module({
  imports: [ImportModule],
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}


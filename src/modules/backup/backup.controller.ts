import { Controller, Get, Req, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PassThrough } from 'stream';
import archiver from 'archiver';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES } from '../../common/roles';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BackupService } from './backup.service';

type JwtRequest = Request & { user?: { username?: string } };

@ApiTags('backup')
@ApiBearerAuth('JWT-auth')
@Controller('api/backup')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLES.ADMIN)
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get('full')
  async full(@Req() req: JwtRequest) {
    const username = req.user?.username?.trim() || 'unknown';
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const zipName = `packing_backup_${y}${m}${d}_${hh}${mm}${ss}.zip`;

    const { csvs, counts } = await this.backupService.buildFullBackupPayload();
    const pass = new PassThrough();
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(pass);

    for (const c of csvs) {
      archive.append(Buffer.from('\ufeff' + c.body, 'utf8'), { name: c.file });
    }

    const meta = {
      generated_at: now.toISOString(),
      generated_by: username,
      system: 'Pinebloom Packing',
      counts,
    };
    archive.append(JSON.stringify(meta, null, 2), { name: 'backup_meta.json' });
    void archive.finalize();

    return new StreamableFile(pass, {
      type: 'application/zip',
      disposition: `attachment; filename="${zipName}"`,
    });
  }
}


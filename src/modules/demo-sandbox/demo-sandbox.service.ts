import {
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class DemoSandboxService {
  private readonly logger = new Logger(DemoSandboxService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auth: AuthService,
  ) {}

  assertSandbox(): void {
    if (!this.auth.isDemoSandbox()) {
      throw new ForbiddenException(
        'Reset solo disponible en entorno DEMO_SANDBOX (no producción).',
      );
    }
  }

  /** Limpia tablas transaccionales (misma lógica que scripts/clear-dev-data.sql). */
  async resetTransactionalData(): Promise<{ ok: true; cleared: true }> {
    this.assertSandbox();
    const sqlPath = join(process.cwd(), 'scripts', 'clear-dev-data.sql');
    const sql = readFileSync(sqlPath, 'utf8');
    this.logger.warn('DEMO_SANDBOX: limpiando datos operativos (maestros intactos)');
    await this.dataSource.query(sql);
    return { ok: true, cleared: true };
  }
}

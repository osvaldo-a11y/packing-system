import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';

/**
 * Evita el genérico "Internal server error" cuando falla SQL (p. ej. columna inexistente por migraciones pendientes).
 */
@Catch(QueryFailedError)
export class TypeOrmQueryFailedFilter implements ExceptionFilter {
  private readonly log = new Logger(TypeOrmQueryFailedFilter.name);

  catch(exception: QueryFailedError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const dev = process.env.NODE_ENV !== 'production';
    const msg = exception.message || 'Error de base de datos';
    const code = (exception as unknown as { driverError?: { code?: string } }).driverError?.code;

    this.log.error(`${code ? `[${code}] ` : ''}${msg}`);

    const missingObject =
      /does not exist|no existe|UndefinedColumnError|relation.*does not exist/i.test(msg) ||
      code === '42703';

    const hint = missingObject
      ? 'Base desactualizada: ejecutá migraciones (npm run migration:run o npm run build && npm run migration:run:prod) y reiniciá la API.'
      : undefined;

    const body: Record<string, unknown> = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: dev ? msg : 'Error de base de datos',
    };
    if (hint) body.hint = hint;

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }
}

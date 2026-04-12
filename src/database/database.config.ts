import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * Configuración TypeORM para Nest y para el CLI de migraciones.
 * Si existe `DATABASE_URL` (típico en Railway, Render, Heroku), se usa en lugar de DB_*.
 */
export function getTypeOrmModuleOptions(): TypeOrmModuleOptions {
  const url = process.env.DATABASE_URL;
  /** Ejecuta migraciones pendientes al levantar la app (Postgres). Desactivar: RUN_MIGRATIONS_ON_STARTUP=false */
  const migrationsRun = process.env.RUN_MIGRATIONS_ON_STARTUP !== 'false';
  const common = {
    type: 'postgres' as const,
    autoLoadEntities: true,
    synchronize: false,
    migrations: ['dist/database/migrations/*.js'],
    migrationsRun,
  };

  if (url) {
    return {
      ...common,
      url,
      ssl:
        process.env.DB_SSL_DISABLED === 'true'
          ? false
          : {
              rejectUnauthorized: false,
            },
    };
  }

  return {
    ...common,
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres',
    database: process.env.DB_NAME || 'packing_system',
  };
}

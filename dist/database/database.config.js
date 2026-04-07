"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTypeOrmModuleOptions = getTypeOrmModuleOptions;
function getTypeOrmModuleOptions() {
    const url = process.env.DATABASE_URL;
    const common = {
        type: 'postgres',
        autoLoadEntities: true,
        synchronize: false,
        migrations: ['dist/database/migrations/*.js'],
    };
    if (url) {
        return {
            ...common,
            url,
            ssl: process.env.DB_SSL_DISABLED === 'true'
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
//# sourceMappingURL=database.config.js.map
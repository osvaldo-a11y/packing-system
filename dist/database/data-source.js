"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const typeorm_1 = require("typeorm");
const dispatch_entities_1 = require("../modules/dispatch/dispatch.entities");
const process_entities_1 = require("../modules/process/process.entities");
const packaging_entities_1 = require("../modules/packaging/packaging.entities");
const reporting_entities_1 = require("../modules/reporting/reporting.entities");
const plant_entities_1 = require("../modules/plant/plant.entities");
const entities = [
    process_entities_1.FruitProcess,
    process_entities_1.PtTag,
    process_entities_1.PtTagItem,
    process_entities_1.PtTagAudit,
    dispatch_entities_1.SalesOrder,
    dispatch_entities_1.SalesOrderModification,
    dispatch_entities_1.Dispatch,
    dispatch_entities_1.DispatchTagItem,
    dispatch_entities_1.PackingList,
    dispatch_entities_1.Invoice,
    dispatch_entities_1.InvoiceItem,
    packaging_entities_1.PackagingMaterial,
    packaging_entities_1.PackagingRecipe,
    packaging_entities_1.PackagingRecipeItem,
    packaging_entities_1.PackagingPalletConsumption,
    packaging_entities_1.PackagingCostBreakdown,
    reporting_entities_1.ReportSnapshot,
    plant_entities_1.PlantSettings,
];
const url = process.env.DATABASE_URL;
const migrations = process.env.NODE_ENV === 'production'
    ? ['dist/database/migrations/*.js']
    : ['src/database/migrations/*.ts'];
exports.default = new typeorm_1.DataSource(url
    ? {
        type: 'postgres',
        url,
        ssl: process.env.DB_SSL_DISABLED === 'true'
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
    });
//# sourceMappingURL=data-source.js.map
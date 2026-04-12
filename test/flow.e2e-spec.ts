import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AbstractSqliteDriver } from 'typeorm/driver/sqlite-abstract/AbstractSqliteDriver';

/** sql.js hereda de SQLite: tipos que Postgres soporta pero SQLite no. */
const _origSqliteNormalize = AbstractSqliteDriver.prototype.normalizeType;
AbstractSqliteDriver.prototype.normalizeType = function (column: { type?: unknown }) {
  if (column.type === 'timestamp') return 'datetime';
  if (column.type === 'timestamptz') return 'datetime';
  if (column.type === 'enum' || column.type === 'simple-enum') return 'text';
  return _origSqliteNormalize.call(this, column);
};
import { AuthModule } from '../src/modules/auth/auth.module';
import { DispatchBillingModule } from '../src/modules/dispatch/dispatch-billing.module';
import { ProcessModule } from '../src/modules/process/process.module';
import {
  Dispatch,
  DispatchPtPackingList,
  DispatchTagItem,
  Invoice,
  InvoiceItem,
  PackingList,
  SalesOrder,
  SalesOrderLine,
  SalesOrderModification,
} from '../src/modules/dispatch/dispatch.entities';
import { PtPackingListModule } from '../src/modules/pt-packing-list/pt-packing-list.module';
import { PtPackingList, PtPackingListItem, PtPackingListReversalEvent } from '../src/modules/pt-packing-list/pt-packing-list.entities';
import {
  FruitProcess,
  FruitProcessComponentValue,
  FruitProcessLineAllocation,
  PtTag,
  PtTagAudit,
  PtTagItem,
  PtTagLineage,
  PtTagMerge,
  PtTagMergeSource,
  RawMaterialMovement,
} from '../src/modules/process/process.entities';
import { PackagingModule } from '../src/modules/packaging/packaging.module';
import {
  PackagingCostBreakdown,
  PackagingMaterial,
  PackagingMaterialMovement,
  PackagingPalletConsumption,
  PackagingRecipe,
  PackagingRecipeItem,
} from '../src/modules/packaging/packaging.entities';
import { FinalPalletModule } from '../src/modules/final-pallet/final-pallet.module';
import { FinalPallet, FinalPalletLine } from '../src/modules/final-pallet/final-pallet.entities';
import { FinishedPtInventory } from '../src/modules/final-pallet/finished-pt-inventory.entity';
import {
  RepalletEvent,
  RepalletLineProvenance,
  RepalletReversal,
  RepalletSource,
} from '../src/modules/final-pallet/repallet.entities';
import { ReportingModule } from '../src/modules/reporting/reporting.module';
import { ReportSnapshot } from '../src/modules/reporting/reporting.entities';
import { PlantModule } from '../src/modules/plant/plant.module';
import { PlantSettings } from '../src/modules/plant/plant.entities';
import { TraceabilityModule } from '../src/modules/traceability/traceability.module';
import {
  Brand,
  Client,
  FinishedPtStock,
  PackingMaterialSupplier,
  PackingSupplier,
  ReturnableContainer,
} from '../src/modules/traceability/operational.entities';
import {
  DocumentState,
  MaterialCategory,
  Mercado,
  ReceptionType,
} from '../src/modules/traceability/catalog.entities';
import {
  PresentationFormat,
  ProcessMachine,
  ProcessResultComponent,
  Producer,
  QualityGrade,
  Reception,
  ReceptionLine,
  Species,
  SpeciesProcessResultComponent,
  Variety,
} from '../src/modules/traceability/traceability.entities';
import { e2eUniqueFormatCode, ensureDocumentStateMercadoRecType, seedMaterialCategories } from './e2e-master-seeds';

/** Postgres real + migraciones: ejecuta reporting en e2e (`npm run test:e2e:pg`). */
const USE_FLOW_PG = process.env.FLOW_E2E_PG === '1';

jest.setTimeout(60000);

describe('End-to-end packing flow', () => {
  let app!: INestApplication;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-e2e';
    if (USE_FLOW_PG) {
      process.env.RUN_MIGRATIONS_ON_STARTUP = 'false';
    }

    const pgImports = USE_FLOW_PG
      ? [
          TypeOrmModule.forRoot({
            type: 'postgres',
            host: process.env.DB_HOST || 'localhost',
            port: Number(process.env.DB_PORT || 5432),
            username: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASS || 'postgres',
            database: process.env.DB_NAME || 'packing_system',
            autoLoadEntities: true,
            synchronize: false,
            migrationsRun: false,
            ssl: process.env.DB_SSL_DISABLED === 'true' ? false : undefined,
          }),
        ]
      : [];

    const sqljsImports = !USE_FLOW_PG
      ? [
          TypeOrmModule.forRoot({
            // sql.js evita el binario nativo de sqlite3 (fallos frecuentes en Windows/Jest).
            type: 'sqljs',
            location: ':memory:',
            autoSave: false,
            entities: [
              Mercado,
              MaterialCategory,
              ReceptionType,
              DocumentState,
              Client,
              Brand,
              PackingSupplier,
              PackingMaterialSupplier,
              ReturnableContainer,
              FinishedPtStock,
              ProcessMachine,
              FruitProcess,
              FruitProcessComponentValue,
              FruitProcessLineAllocation,
              RawMaterialMovement,
              PtTag,
              PtTagMerge,
              PtTagMergeSource,
              PtTagLineage,
              PtTagItem,
              PtTagAudit,
              SalesOrder,
              SalesOrderLine,
              SalesOrderModification,
              Dispatch,
              DispatchPtPackingList,
              DispatchTagItem,
              PtPackingList,
              PtPackingListItem,
              PtPackingListReversalEvent,
              PackingList,
              Invoice,
              InvoiceItem,
              PackagingMaterial,
              PackagingRecipe,
              PackagingRecipeItem,
              PackagingPalletConsumption,
              PackagingCostBreakdown,
              PackagingMaterialMovement,
              FinalPallet,
              FinalPalletLine,
              RepalletEvent,
              RepalletReversal,
              RepalletSource,
              RepalletLineProvenance,
              FinishedPtInventory,
              ReportSnapshot,
              PlantSettings,
              Species,
              Producer,
              Variety,
              PresentationFormat,
              Reception,
              ReceptionLine,
              QualityGrade,
              ProcessResultComponent,
              SpeciesProcessResultComponent,
            ],
            synchronize: true,
          }),
        ]
      : [];

    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ ttl: 60_000, limit: 10_000 }],
        }),
        ...pgImports,
        ...sqljsImports,
        AuthModule,
        TraceabilityModule,
        ProcessModule,
        DispatchBillingModule,
        PtPackingListModule,
        PackagingModule,
        FinalPalletModule,
        PlantModule,
        ReportingModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('runs Process -> Tag -> Dispatch -> Invoice flow with JWT', async () => {
    const loginAdmin = await request(app.getHttpServer()).post('/api/auth/login').send({
      username: 'admin',
      password: 'admin123',
    }).expect(201);

    const adminToken = loginAdmin.body.access_token as string;
    expect(adminToken).toBeDefined();

    const loginSupervisor = await request(app.getHttpServer()).post('/api/auth/login').send({
      username: 'supervisor',
      password: 'sup123',
    }).expect(201);
    const supervisorToken = loginSupervisor.body.access_token as string;

    const loginOperator = await request(app.getHttpServer()).post('/api/auth/login').send({
      username: 'operator',
      password: 'op123',
    }).expect(201);
    const operatorToken = loginOperator.body.access_token as string;

    await request(app.getHttpServer()).get('/api/reporting/generate').query({ productor_id: 10 }).expect(401);

    const runId = USE_FLOW_PG ? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : '';
    const u = (s: string) => (runId ? `${s}-${runId}` : s);
    /** TraceabilityService exige código y nombre únicos por especie (no solo código). */
    const nm = (label: string) => (runId ? `${label} ${runId}` : label);
    /** Máx. 20 caracteres (CreatePresentationFormatDto). */
    const formatMain = USE_FLOW_PG ? e2eUniqueFormatCode(12) : '12x18oz';

    await ensureDocumentStateMercadoRecType(supervisorToken, app.getHttpServer());
    await seedMaterialCategories(supervisorToken, app.getHttpServer());

    const speciesRes = await request(app.getHttpServer())
      .post('/api/masters/species')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ codigo: u('ARB'), nombre: nm('Arándano') })
      .expect(201);

    const producerRes = await request(app.getHttpServer())
      .post('/api/masters/producers')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ codigo: u('P10'), nombre: nm('Productor Test') })
      .expect(201);

    const varietyRes = await request(app.getHttpServer())
      .post('/api/masters/varieties')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ species_id: speciesRes.body.id, codigo: u('EM'), nombre: nm('Emerald') })
      .expect(201);

    const formatRes = await request(app.getHttpServer())
      .post('/api/masters/presentation-formats')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ format_code: formatMain, net_weight_lb_per_box: 13.5, max_boxes_per_pallet: 100 })
      .expect(201);

    const qualityGradeRes = await request(app.getHttpServer())
      .post('/api/masters/quality-grades')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ codigo: u('E2E-A'), nombre: nm('Calidad E2E'), purpose: 'exportacion' })
      .expect(201);

    const returnableRes = await request(app.getHttpServer())
      .post('/api/masters/returnable-containers')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ tipo: 'Bin', capacidad: u('E2E') })
      .expect(201);

    const clientE2ERes = await request(app.getHttpServer())
      .post('/api/masters/clients')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ codigo: u('CLI-E2E'), nombre: nm('Cliente E2E') })
      .expect(201);

    const brandE2ERes = await request(app.getHttpServer())
      .post('/api/masters/brands')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ codigo: u('ALP-E2E'), nombre: nm('Marca especial E2E'), client_id: clientE2ERes.body.id })
      .expect(201);

    const receptionRes = await request(app.getHttpServer())
      .post('/api/receptions')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        received_at: '2026-04-07T08:00:00.000Z',
        document_number: u('REC-E2E-001'),
        producer_id: producerRes.body.id,
        variety_id: varietyRes.body.id,
        lines: [
          {
            species_id: speciesRes.body.id,
            variety_id: varietyRes.body.id,
            quality_grade_id: qualityGradeRes.body.id,
            returnable_container_id: returnableRes.body.id,
            quantity: 1,
            net_lb: 2000,
          },
        ],
      })
      .expect(201);

    const receptionLineId = receptionRes.body.lines[0].id as number;

    // 100 cajas × 13.5 lb/caja (12x18oz) = 1350 lb packout desde tarja; entrada = MP asignada.
    const processRes = await request(app.getHttpServer())
      .post('/api/processes')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        producer_id: producerRes.body.id,
        allocations: [{ reception_line_id: receptionLineId, lb_allocated: 1350 }],
        fecha_proceso: '2026-04-07T10:00:00.000Z',
        resultado: 'IQF',
      })
      .expect(201);

    const tagRes = await request(app.getHttpServer())
      .post('/api/pt-tags')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        fecha: '2026-04-07T10:00:00.000Z',
        resultado: 'IQF',
        format_code: formatMain,
        cajas_por_pallet: 100,
        client_id: clientE2ERes.body.id,
        brand_id: brandE2ERes.body.id,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/pt-tags/${tagRes.body.id}/items`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        process_id: processRes.body.id,
      })
      .expect(201);

    /** Pallet técnico 1:1 creado por sync al tener stock real en la unidad PT (sin POST /api/final-pallets). */
    const fpRepo = app.get(DataSource).getRepository(FinalPallet);
    const syncedFp = await fpRepo.findOne({ where: { tarja_id: tagRes.body.id } });
    expect(syncedFp).not.toBeNull();
    expect(syncedFp!.status).toBe('definitivo');
    expect(Number(syncedFp!.tarja_id)).toBe(tagRes.body.id);
    expect(await fpRepo.count({ where: { tarja_id: tagRes.body.id } })).toBe(1);
    expect(syncedFp!.corner_board_code).toBe(`PF-${syncedFp!.id}`);
    expect(syncedFp!.client_id).toBe(clientE2ERes.body.id);
    expect(syncedFp!.brand_id).toBe(brandE2ERes.body.id);
    expect(syncedFp!.presentation_format_id).toBe(formatRes.body.id);

    const exRes = await request(app.getHttpServer())
      .get('/api/final-pallets/existencias-pt?solo_deposito=1')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    const tarDisplay = `TAR-${tagRes.body.id}`;
    const exRow = (exRes.body as Array<{ id: number; codigo_unidad_pt_display?: string }>).find(
      (r) => r.id === syncedFp!.id,
    );
    expect(exRow).toBeDefined();
    expect(exRow!.codigo_unidad_pt_display).toBe(tarDisplay);

    const finalPalletId = syncedFp!.id;

    const soRes = await request(app.getHttpServer())
      .post('/api/sales-orders')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        cliente_id: 20,
        lines: [
          {
            presentation_format_id: formatRes.body.id,
            requested_boxes: 2000,
            unit_price: null,
            brand_id: null,
            variety_id: null,
          },
        ],
      })
      .expect(201);

    const inv = await app
      .get(DataSource)
      .getRepository(FinishedPtInventory)
      .findOne({ where: { final_pallet_id: finalPalletId } });
    expect(inv).not.toBeNull();
    expect(inv!.boxes).toBe(100);
    expect(inv!.aggregate_boxes_recorded).toBe(100);
    expect(inv!.trace_lines).toHaveLength(1);
    expect(inv!.trace_lines![0].fruit_process_id).toBe(processRes.body.id);
    expect(inv!.trace_lines![0].recepcion_id).toBe(receptionRes.body.id);

    const traceRes = await request(app.getHttpServer())
      .get(`/api/final-pallets/${finalPalletId}/traceability`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    expect(traceRes.body.pallet.totals.amount).toBe(100);
    expect(traceRes.body.lines).toHaveLength(1);
    expect(traceRes.body.lines[0].fruit_process_id).toBe(processRes.body.id);
    expect(traceRes.body.lines[0].recepcion?.id).toBe(receptionRes.body.id);

    const ptPlRes = await request(app.getHttpServer())
      .post('/api/pt-packing-lists')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ final_pallet_ids: [finalPalletId] })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/pt-packing-lists/${ptPlRes.body.id}/confirm`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201);

    const dispatchRes = await request(app.getHttpServer())
      .post('/api/dispatches')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        pt_packing_list_ids: [ptPlRes.body.id],
        orden_id: soRes.body.id,
        cliente_id: 20,
        fecha_despacho: '2026-04-07T16:00:00.000Z',
        numero_bol: u('BOL-001'),
        temperatura_f: 34,
        final_pallet_unit_prices: { [String(formatRes.body.id)]: 22.5 },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/dispatches/${dispatchRes.body.id}/confirm`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/dispatches/${dispatchRes.body.id}/packing-list/generate`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201);
    const invoiceRes = await request(app.getHttpServer())
      .post(`/api/dispatches/${dispatchRes.body.id}/invoice/generate`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201);

    expect(Number(invoiceRes.body.total)).toBeGreaterThan(0);
    const dispatchesAfterInvoice = await request(app.getHttpServer())
      .get('/api/dispatches')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    const dispatchWithInvoice = (dispatchesAfterInvoice.body as Array<{ id: number; invoice?: { lines?: unknown[] } | null }>)
      .find((d) => Number(d.id) === Number(dispatchRes.body.id));
    expect(dispatchWithInvoice?.invoice?.lines?.length ?? 0).toBeGreaterThan(0);

    const manualLine = await request(app.getHttpServer())
      .post(`/api/dispatches/${dispatchRes.body.id}/invoice/lines`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        descripcion: 'Ajuste manual e2e',
        cantidad: 2,
        unit_price: 10.5,
        tipo: 'cargo',
      })
      .expect(201);
    expect(manualLine.body).toHaveProperty('invoice_number');

    const matCatsRes = await request(app.getHttpServer())
      .get('/api/masters/material-categories')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    const matCatId = (codigo: string) =>
      (matCatsRes.body as { id: number; codigo: string }[]).find((c) => c.codigo === codigo)!.id;

    const clamshell = await request(app.getHttpServer())
      .post('/api/packaging/materials')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        nombre_material: nm('Clamshell 18oz'),
        material_category_id: matCatId('clamshell'),
        unidad_medida: 'unit',
        costo_unitario: 0.4,
        cantidad_disponible: 10000,
      })
      .expect(201);

    const tape = await request(app.getHttpServer())
      .post('/api/packaging/materials')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        nombre_material: nm('Tape'),
        material_category_id: matCatId('tape'),
        unidad_medida: 'm',
        costo_unitario: 0.08,
        cantidad_disponible: 2000,
      })
      .expect(201);

    const corner = await request(app.getHttpServer())
      .post('/api/packaging/materials')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        nombre_material: nm('Corner Board'),
        material_category_id: matCatId('corner_board'),
        unidad_medida: 'unit',
        costo_unitario: 1.2,
        cantidad_disponible: 1000,
      })
      .expect(201);

    const etiqueta = await request(app.getHttpServer())
      .post('/api/packaging/materials')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        nombre_material: nm('Etiqueta PT'),
        material_category_id: matCatId('etiqueta'),
        unidad_medida: 'unit',
        costo_unitario: 0.05,
        cantidad_disponible: 2000,
      })
      .expect(201);

    const recipe = await request(app.getHttpServer())
      .post('/api/packaging/recipes')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        presentation_format_id: formatRes.body.id,
        descripcion: `Receta base ${formatMain}`,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/packaging/recipes/${recipe.body.id}/items`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        material_id: clamshell.body.id,
        qty_per_unit: 12,
        base_unidad: 'box',
      })
      .expect(201);

    const consumption = await request(app.getHttpServer())
      .post('/api/packaging/consumptions')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        tarja_id: tagRes.body.id,
        dispatch_tag_item_id: 1,
        recipe_id: recipe.body.id,
        pallet_count: 1,
        boxes_count: 100,
        tape_linear_meters: 15,
        corner_boards_qty: 8,
        labels_qty: 100,
      })
      .expect(201);

    expect(consumption.body.total_cost).toBeGreaterThan(0);
    expect(consumption.body.breakdowns.length).toBeGreaterThanOrEqual(4);

    const materials = await request(app.getHttpServer())
      .get('/api/packaging/materials')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    const clamshellAfter = materials.body.find((m: { id: number }) => m.id === clamshell.body.id);
    const tapeAfter = materials.body.find((m: { id: number }) => m.id === tape.body.id);
    const cornerAfter = materials.body.find((m: { id: number }) => m.id === corner.body.id);
    const etiquetaAfter = materials.body.find((m: { id: number }) => m.id === etiqueta.body.id);

    expect(Number(clamshellAfter.cantidad_disponible)).toBeLessThanOrEqual(10000);
    expect(Number(tapeAfter.cantidad_disponible)).toBeLessThanOrEqual(2000);
    expect(Number(cornerAfter.cantidad_disponible)).toBeLessThanOrEqual(1000);
    expect(Number(etiquetaAfter.cantidad_disponible)).toBeLessThanOrEqual(2000);
    expect(
      [
        Number(clamshellAfter.cantidad_disponible) < 10000,
        Number(tapeAfter.cantidad_disponible) < 2000,
        Number(cornerAfter.cantidad_disponible) < 1000,
        Number(etiquetaAfter.cantidad_disponible) < 2000,
      ].some(Boolean),
    ).toBe(true);

    const clamshellMoves = await request(app.getHttpServer())
      .get(`/api/packaging/materials/${clamshell.body.id}/movements`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    expect(Array.isArray(clamshellMoves.body)).toBe(true);
    expect(clamshellMoves.body.length).toBeGreaterThan(0);
    expect(clamshellMoves.body.some((m: { quantity_delta: string }) => Number(m.quantity_delta) < 0)).toBe(true);

    await request(app.getHttpServer()).put(`/api/pt-tags/${tagRes.body.id}`).send({
      format_code: formatMain,
      cajas_por_pallet: 80,
    }).expect(401);

    await request(app.getHttpServer()).put(`/api/pt-tags/${tagRes.body.id}`).set('Authorization', `Bearer ${adminToken}`).send({
      format_code: formatMain,
      cajas_por_pallet: 80,
    }).expect(200);

    expect(
      await app.get(DataSource).getRepository(FinalPallet).count({ where: { tarja_id: tagRes.body.id } }),
    ).toBe(1);

    await request(app.getHttpServer()).put(`/api/sales-orders/${soRes.body.id}`).send({
      requested_pallets: 15,
      requested_boxes: 1500,
    }).expect(401);

    await request(app.getHttpServer()).put(`/api/sales-orders/${soRes.body.id}`).set('Authorization', `Bearer ${supervisorToken}`).send({
      lines: [
        {
          presentation_format_id: formatRes.body.id,
          requested_boxes: 1500,
          unit_price: null,
          brand_id: null,
          variety_id: null,
        },
      ],
    }).expect(200);

    const plant = await request(app.getHttpServer()).get('/api/plant-settings').expect(200);
    expect(plant.body).toHaveProperty('min_yield_percent');

    await request(app.getHttpServer()).put('/api/plant-settings').set('Authorization', `Bearer ${operatorToken}`).send({
      yield_tolerance_percent: 6,
      min_yield_percent: 65,
      max_merma_percent: 18,
    }).expect(403);

    await request(app.getHttpServer()).put('/api/plant-settings').set('Authorization', `Bearer ${adminToken}`).send({
      yield_tolerance_percent: 6,
      min_yield_percent: 65,
      max_merma_percent: 18,
    }).expect(200);

    /** Reporting usa SQL específico de Postgres (`::cast`, etc.); sql.js no lo soporta. Validar con BD real o E2E_PG. */
    const ds = app.get(DataSource);
    const canRunReporting = (ds.options as { type?: string }).type !== 'sqljs';

    if (canRunReporting) {
      const reportRes = await request(app.getHttpServer()).get('/api/reporting/generate').set('Authorization', `Bearer ${operatorToken}`).query({
        productor_id: producerRes.body.id,
        tarja_id: tagRes.body.id,
        page: 1,
        limit: 10,
      }).expect(200);

      expect(reportRes.body.boxesByProducer).toHaveProperty('rows');
      expect(reportRes.body.boxesByProducerDetail).toHaveProperty('rows');
      expect(reportRes.body.dispatchedBoxesByProducer).toHaveProperty('rows');
      expect(reportRes.body).toHaveProperty('plant_thresholds');
      expect(reportRes.body.clientMarginSummary).toHaveProperty('rows');
      expect(reportRes.body.clientMarginDetail).toHaveProperty('rows');

      const csvExport = await request(app.getHttpServer()).get('/api/reporting/export').set('Authorization', `Bearer ${adminToken}`).query({
        format: 'csv',
        productor_id: producerRes.body.id,
      }).expect(200);

      expect(csvExport.headers['content-type']).toMatch(/text\/csv/);

      const pdfExport = await request(app.getHttpServer()).get('/api/reporting/export').set('Authorization', `Bearer ${adminToken}`).query({
        format: 'pdf',
        pdf_profile: 'external',
        productor_id: producerRes.body.id,
      }).expect(200);
      expect(pdfExport.headers['content-type']).toMatch(/application\/pdf/);
      expect(pdfExport.body.length).toBeGreaterThan(100);

      const savedReport = await request(app.getHttpServer()).post('/api/reporting/saved-reports').set('Authorization', `Bearer ${adminToken}`).send({
        report_name: 'Reporte operativo',
        filters: { productor_id: producerRes.body.id },
        payload: reportRes.body,
      }).expect(201);

      await request(app.getHttpServer()).put(`/api/reporting/saved-reports/${savedReport.body.id}`).set('Authorization', `Bearer ${supervisorToken}`).send({
        report_name: 'Reporte operativo actualizado',
        filters: { productor_id: producerRes.body.id, tarja_id: tagRes.body.id },
        payload: reportRes.body,
      }).expect(200);

      await request(app.getHttpServer()).delete(`/api/reporting/saved-reports/${savedReport.body.id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    }
  });

  it('repallet merge and reverse restores origins, inventory and audit trail', async () => {
    const sfx = `R${Date.now()}`;
    const ds = app.get(DataSource);

    const loginOperator = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'operator', password: 'op123' })
      .expect(201);
    const operatorToken = loginOperator.body.access_token as string;

    const loginSupervisor = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'supervisor', password: 'sup123' })
      .expect(201);
    const supervisorToken = loginSupervisor.body.access_token as string;

    const loginAdmin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(201);
    const adminTokenRepallet = loginAdmin.body.access_token as string;

    const docStates = await request(app.getHttpServer())
      .get('/api/masters/document-states')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
    if (!(docStates.body as { codigo: string }[]).some((x) => x.codigo === 'borrador')) {
      await request(app.getHttpServer())
        .post('/api/masters/document-states')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ codigo: 'borrador', nombre: 'Borrador' })
        .expect(201);
    }
    const recTypes = await request(app.getHttpServer())
      .get('/api/masters/reception-types')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
    if (!(recTypes.body as { codigo: string }[]).some((x) => x.codigo === 'hand_picking')) {
      await request(app.getHttpServer())
        .post('/api/masters/reception-types')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ codigo: 'hand_picking', nombre: 'Mano' })
        .expect(201);
    }
    const mercados = await request(app.getHttpServer())
      .get('/api/masters/mercados')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(200);
    if (!(mercados.body as { codigo: string }[]).some((x) => x.codigo === 'USA')) {
      await request(app.getHttpServer())
        .post('/api/masters/mercados')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ codigo: 'USA', nombre: 'USA' })
        .expect(201);
    }

    const speciesRes = await request(app.getHttpServer())
      .post('/api/masters/species')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ codigo: `ARB${sfx}`, nombre: `Arándano ${sfx}` })
      .expect(201);

    const producerRes = await request(app.getHttpServer())
      .post('/api/masters/producers')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ codigo: `P${sfx}`, nombre: `Productor ${sfx}` })
      .expect(201);

    const varietyRes = await request(app.getHttpServer())
      .post('/api/masters/varieties')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ species_id: speciesRes.body.id, codigo: `EM${sfx}`, nombre: `Emerald ${sfx}` })
      .expect(201);

    const formatRes = await request(app.getHttpServer())
      .post('/api/masters/presentation-formats')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        format_code: e2eUniqueFormatCode(8),
        net_weight_lb_per_box: 13.5,
        max_boxes_per_pallet: 100,
      })
      .expect(201);

    const qualityGradeRes = await request(app.getHttpServer())
      .post('/api/masters/quality-grades')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ codigo: `Q${sfx}`, nombre: `Calidad ${sfx}`, purpose: 'exportacion' })
      .expect(201);

    const returnableRes = await request(app.getHttpServer())
      .post('/api/masters/returnable-containers')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ tipo: 'Bin', capacidad: `E2E-${sfx}` })
      .expect(201);

    const clientRes = await request(app.getHttpServer())
      .post('/api/masters/clients')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ codigo: `CLI-${sfx}`, nombre: `Cliente ${sfx}` })
      .expect(201);

    const brandRes = await request(app.getHttpServer())
      .post('/api/masters/brands')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ codigo: `BR-${sfx}`, nombre: `Marca ${sfx}`, client_id: clientRes.body.id })
      .expect(201);

    const receptionRes = await request(app.getHttpServer())
      .post('/api/receptions')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        received_at: '2026-04-08T08:00:00.000Z',
        document_number: `REC-${sfx}`,
        producer_id: producerRes.body.id,
        variety_id: varietyRes.body.id,
        lines: [
          {
            species_id: speciesRes.body.id,
            variety_id: varietyRes.body.id,
            quality_grade_id: qualityGradeRes.body.id,
            returnable_container_id: returnableRes.body.id,
            quantity: 1,
            net_lb: 4000,
          },
        ],
      })
      .expect(201);

    const receptionLineId = receptionRes.body.lines[0].id as number;

    const processRes = await request(app.getHttpServer())
      .post('/api/processes')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        producer_id: producerRes.body.id,
        allocations: [{ reception_line_id: receptionLineId, lb_allocated: 2000 }],
        fecha_proceso: '2026-04-08T10:00:00.000Z',
        resultado: 'IQF',
      })
      .expect(201);

    const linePayload = {
      fruit_process_id: processRes.body.id,
      fecha: '2026-04-08T12:00:00.000Z',
      variedad_id: varietyRes.body.id,
      amount: 10,
      pounds: 135,
      net_lb: 135,
    };

    const palletARes = await request(app.getHttpServer())
      .post('/api/final-pallets')
      .set('Authorization', `Bearer ${adminTokenRepallet}`)
      .send({
        species_id: speciesRes.body.id,
        status: 'definitivo',
        clamshell_label: `Clamshell ${sfx}`,
        brand_id: brandRes.body.id,
        dispatch_unit: 'CHEP',
        packing_type: 'Exportadora',
        market: 'USA',
        client_id: clientRes.body.id,
        fruit_quality_mode: 'proceso',
        presentation_format_id: formatRes.body.id,
        lines: [linePayload],
      })
      .expect(201);

    const palletBRes = await request(app.getHttpServer())
      .post('/api/final-pallets')
      .set('Authorization', `Bearer ${adminTokenRepallet}`)
      .send({
        species_id: speciesRes.body.id,
        status: 'definitivo',
        clamshell_label: `Clamshell ${sfx}`,
        brand_id: brandRes.body.id,
        dispatch_unit: 'CHEP',
        packing_type: 'Exportadora',
        market: 'USA',
        client_id: clientRes.body.id,
        fruit_quality_mode: 'proceso',
        presentation_format_id: formatRes.body.id,
        lines: [linePayload],
      })
      .expect(201);

    const idA = palletARes.body.id as number;
    const idB = palletBRes.body.id as number;

    const invBefore = await ds.getRepository(FinishedPtInventory).find({
      where: [{ final_pallet_id: idA }, { final_pallet_id: idB }],
    });
    expect(invBefore).toHaveLength(2);
    expect(invBefore.every((r) => r.boxes === 10)).toBe(true);

    const repalletRes = await request(app.getHttpServer())
      .post('/api/final-pallets/repallet')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        sources: [
          { final_pallet_id: idA, boxes: 10 },
          { final_pallet_id: idB, boxes: 10 },
        ],
        notes: `e2e repallet ${sfx}`,
      })
      .expect(201);

    const resultId = repalletRes.body.id as number;
    expect(repalletRes.body.status).toBe('definitivo');
    expect(repalletRes.body.totals.amount).toBe(20);

    const paDrained = await request(app.getHttpServer())
      .get(`/api/final-pallets/${idA}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    const pbDrained = await request(app.getHttpServer())
      .get(`/api/final-pallets/${idB}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    expect(paDrained.body.status).toBe('repaletizado');
    expect(pbDrained.body.status).toBe('repaletizado');
    expect(paDrained.body.totals.amount).toBe(0);
    expect(pbDrained.body.totals.amount).toBe(0);

    const traceBeforeReverse = await request(app.getHttpServer())
      .get(`/api/final-pallets/${resultId}/traceability`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    expect(traceBeforeReverse.body.repallet?.as_result?.event_id).toBeDefined();
    expect(traceBeforeReverse.body.repallet?.reverse?.can_reverse).toBe(true);
    expect(traceBeforeReverse.body.repallet?.reverse?.reversed_at).toBeNull();

    const eventId = traceBeforeReverse.body.repallet.as_result.event_id as number;

    const revRes = await request(app.getHttpServer())
      .post(`/api/final-pallets/${resultId}/repallet-reverse`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ notes: `e2e reversa ${sfx}` })
      .expect(201);

    expect(revRes.body.status).toBe('revertido');
    expect(revRes.body.totals.amount).toBe(0);

    const traceAfter = await request(app.getHttpServer())
      .get(`/api/final-pallets/${resultId}/traceability`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    expect(traceAfter.body.repallet?.reverse?.can_reverse).toBe(false);
    expect(traceAfter.body.repallet?.reverse?.reversed_at).toBeTruthy();
    expect(traceAfter.body.repallet?.reverse?.reversal?.reversed_by_username).toBe('operator');
    expect(traceAfter.body.repallet?.reverse?.reversal?.notes).toContain('e2e reversa');

    const paRestored = await request(app.getHttpServer())
      .get(`/api/final-pallets/${idA}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    const pbRestored = await request(app.getHttpServer())
      .get(`/api/final-pallets/${idB}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    expect(paRestored.body.status).toBe('definitivo');
    expect(pbRestored.body.status).toBe('definitivo');
    expect(paRestored.body.totals.amount).toBe(10);
    expect(pbRestored.body.totals.amount).toBe(10);

    const invA = await ds.getRepository(FinishedPtInventory).findOne({ where: { final_pallet_id: idA } });
    const invB = await ds.getRepository(FinishedPtInventory).findOne({ where: { final_pallet_id: idB } });
    const invR = await ds.getRepository(FinishedPtInventory).findOne({ where: { final_pallet_id: resultId } });
    expect(invA?.boxes).toBe(10);
    expect(invB?.boxes).toBe(10);
    expect(invR?.boxes).toBe(0);

    const evRow = await ds.getRepository(RepalletEvent).findOne({ where: { id: eventId } });
    expect(evRow?.reversed_at).toBeTruthy();

    const reversalRow = await ds
      .getRepository(RepalletReversal)
      .findOne({ where: { repallet_event_id: eventId } });
    expect(reversalRow).not.toBeNull();
    expect(reversalRow!.reversed_by_username).toBe('operator');

    const provCount = await ds.getRepository(RepalletLineProvenance).count({ where: { event_id: eventId } });
    expect(provCount).toBeGreaterThan(0);
  });
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { config as loadEnv } from 'dotenv';
import { AbstractSqliteDriver } from 'typeorm/driver/sqlite-abstract/AbstractSqliteDriver';

loadEnv();

/** La liquidación usa SQL de Postgres (p. ej. ANY($1::bigint[])); ejecutar con LIQUIDACION_E2E_PG=1 y DB en marcha. */
const USE_PG = process.env.LIQUIDACION_E2E_PG === '1';

const _origSqliteNormalize = AbstractSqliteDriver.prototype.normalizeType;
AbstractSqliteDriver.prototype.normalizeType = function (column: { type?: unknown }) {
  if (column.type === 'timestamp') return 'datetime';
  if (column.type === 'timestamptz') return 'datetime';
  if (column.type === 'enum' || column.type === 'simple-enum') return 'text';
  return _origSqliteNormalize.call(this, column);
};

function uniqueFormatCode(prefix: number) {
  const oz = 100 + Math.floor(Math.random() * 899);
  return `${prefix}x${oz}oz`;
}

/** Despacho en día calendario distinto por corrida (DB Postgres no se resetea entre jest). */
function uniqueDispatchDay(dayOffsetFrom2035: number) {
  const slot = Date.now() % 3400;
  return new Date(Date.UTC(2035, 0, dayOffsetFrom2035 + slot)).toISOString().slice(0, 10);
}

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
import { PackingCost, ReportSnapshot } from '../src/modules/reporting/reporting.entities';
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
import { ensureDocumentStateMercadoRecType, matCatId, seedMaterialCategories } from './e2e-master-seeds';

jest.setTimeout(120_000);

/** Salida acotada para reporte manual / CI logs */
function settlementEvidence(label: string, body: Record<string, unknown>) {
  const diag = body.producerSettlementDiagnostic as
    | {
        meta?: Record<string, unknown>;
        invoice_lines?: Array<Record<string, unknown>>;
      }
    | undefined;
  const sum = body.producerSettlementSummary as { rows?: unknown[]; total?: number } | undefined;
  const det = body.producerSettlementDetail as { rows?: unknown[]; total?: number } | undefined;
  const lines = (diag?.invoice_lines ?? []).map((r) => ({
    line_id: r.line_id,
    tarja_id: r.tarja_id,
    final_pallet_id: r.final_pallet_id,
    fruit_process_id: r.fruit_process_id,
    resolucion_source: r.resolucion_source,
    resolucion_productor: r.resolucion_productor,
    cajas: r.cajas,
    ventas: r.ventas,
    aporte_liquidacion: r.aporte_liquidacion,
    slices_json: r.slices_json,
  }));
  const out = {
    label,
    meta: diag?.meta ?? null,
    producerSettlementSummary: { total: sum?.total, rows: sum?.rows ?? [] },
    producerSettlementDetail: { total: det?.total, rows: det?.rows ?? [] },
    invoice_line_diagnostics: lines,
  };
  // eslint-disable-next-line no-console
  console.log(`\n========== ${label} ==========\n${JSON.stringify(out, null, 2)}\n`);
  return out;
}

const liquidacionDescribe = USE_PG ? describe : describe.skip;

liquidacionDescribe('Liquidación por productor — escenarios controlados (e2e, Postgres)', () => {
  let app!: INestApplication;

  beforeAll(async () => {
    process.env.AUTH_USERS_JSON = JSON.stringify([
      { username: 'admin', password: 'admin123', role: 'admin' },
      { username: 'supervisor', password: 'sup123', role: 'supervisor' },
      { username: 'operator', password: 'op123', role: 'operator' },
    ]);
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-e2e';
    process.env.RUN_MIGRATIONS_ON_STARTUP = 'false';

    const typeOrmImports = USE_PG
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
          }),
        ]
      : [];

    const sqliteImports = !USE_PG
      ? [
          TypeOrmModule.forRoot({
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
              PackingCost,
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
        ...typeOrmImports,
        ...sqliteImports,
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

  it('Escenario 1: pallet simple — 1 productor, liquidación y costos', async () => {
    const server = app.getHttpServer();
    const sfx = `L1${Date.now()}`;
    const dispatchDay = uniqueDispatchDay(1);

    const loginAdmin = await request(server).post('/api/auth/login').send({ username: 'admin', password: 'admin123' }).expect(201);
    const adminToken = loginAdmin.body.access_token as string;
    const loginSupervisor = await request(server).post('/api/auth/login').send({ username: 'supervisor', password: 'sup123' }).expect(201);
    const supervisorToken = loginSupervisor.body.access_token as string;
    const loginOperator = await request(server).post('/api/auth/login').send({ username: 'operator', password: 'op123' }).expect(201);
    const operatorToken = loginOperator.body.access_token as string;

    await ensureDocumentStateMercadoRecType(supervisorToken, server);
    await seedMaterialCategories(supervisorToken, server);

    const formatCode = uniqueFormatCode(10);
    const speciesRes = await request(server)
      .post('/api/masters/species')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ codigo: `ARB-${sfx}`, nombre: `Arándano ${sfx}` })
      .expect(201);

    const producerRes = await request(server)
      .post('/api/masters/producers')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ codigo: `P-${sfx}`, nombre: `Productor ${sfx}` })
      .expect(201);

    const pricePackingPerLbS1 = 0.42;
    await request(server)
      .post('/api/reporting/packing-costs')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ species_id: speciesRes.body.id, price_per_lb: pricePackingPerLbS1, active: true })
      .expect(201);

    const varietyRes = await request(server)
      .post('/api/masters/varieties')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ species_id: speciesRes.body.id, codigo: `EM-${sfx}`, nombre: `Emerald ${sfx}` })
      .expect(201);

    const formatRes = await request(server)
      .post('/api/masters/presentation-formats')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        format_code: formatCode,
        species_id: speciesRes.body.id,
        net_weight_lb_per_box: 13.5,
        max_boxes_per_pallet: 100,
      })
      .expect(201);

    const qualityGradeRes = await request(server)
      .post('/api/masters/quality-grades')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ codigo: `Q-${sfx}`, nombre: `Calidad ${sfx}`, purpose: 'exportacion' })
      .expect(201);

    const returnableRes = await request(server)
      .post('/api/masters/returnable-containers')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ tipo: 'Bin', capacidad: `E2E-${sfx}` })
      .expect(201);

    const clientRes = await request(server)
      .post('/api/masters/clients')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ codigo: `CLI-${sfx}`, nombre: `Cliente ${sfx}` })
      .expect(201);

    const brandRes = await request(server)
      .post('/api/masters/brands')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ codigo: `BR-${sfx}`, nombre: `Marca ${sfx}`, client_id: clientRes.body.id })
      .expect(201);

    const receptionRes = await request(server)
      .post('/api/receptions')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        received_at: `${dispatchDay}T08:00:00.000Z`,
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
            net_lb: 2000,
          },
        ],
      })
      .expect(201);

    const receptionLineId = receptionRes.body.lines[0].id as number;

    const processRes = await request(server)
      .post('/api/processes')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        producer_id: producerRes.body.id,
        allocations: [{ reception_line_id: receptionLineId, lb_allocated: 1350 }],
        fecha_proceso: `${dispatchDay}T10:00:00.000Z`,
        resultado: 'IQF',
      })
      .expect(201);

    const tagRes = await request(server)
      .post('/api/pt-tags')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        fecha: `${dispatchDay}T10:00:00.000Z`,
        resultado: 'IQF',
        format_code: formatCode,
        cajas_por_pallet: 100,
      })
      .expect(201);

    await request(server)
      .post(`/api/pt-tags/${tagRes.body.id}/items`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ process_id: processRes.body.id })
      .expect(201);

    const clamshell = await request(server)
      .post('/api/packaging/materials')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        nombre_material: `Clamshell ${sfx}`,
        material_category_id: await matCatId(supervisorToken, server, 'clamshell'),
        unidad_medida: 'unit',
        costo_unitario: 0.35,
        cantidad_disponible: 10000,
      })
      .expect(201);

    const recipe = await request(server)
      .post('/api/packaging/recipes')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ presentation_format_id: formatRes.body.id, descripcion: `Receta ${sfx}` })
      .expect(201);

    await request(server)
      .post(`/api/packaging/recipes/${recipe.body.id}/items`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        material_id: clamshell.body.id,
        qty_per_unit: 12,
        base_unidad: 'box',
      })
      .expect(201);

    const finalPalletRes = await request(server)
      .post('/api/final-pallets')
      .set('Authorization', `Bearer ${operatorToken}`)
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
        lines: [
          {
            fruit_process_id: processRes.body.id,
            fecha: `${dispatchDay}T12:00:00.000Z`,
            variedad_id: varietyRes.body.id,
            amount: 10,
            pounds: 135,
            net_lb: 135,
          },
        ],
      })
      .expect(201);

    const ptPlRes = await request(server).post('/api/pt-packing-lists').set('Authorization', `Bearer ${operatorToken}`).send({ final_pallet_ids: [finalPalletRes.body.id] }).expect(201);
    await request(server).post(`/api/pt-packing-lists/${ptPlRes.body.id}/confirm`).set('Authorization', `Bearer ${operatorToken}`).expect(201);

    const soRes = await request(server)
      .post('/api/sales-orders')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        cliente_id: clientRes.body.id,
        lines: [
          {
            presentation_format_id: formatRes.body.id,
            requested_boxes: 500,
            unit_price: null,
            brand_id: null,
            variety_id: null,
          },
        ],
      })
      .expect(201);

    const unitPrice = 22.5;
    const dispatchRes = await request(server)
      .post('/api/dispatches')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        pt_packing_list_ids: [ptPlRes.body.id],
        orden_id: soRes.body.id,
        cliente_id: clientRes.body.id,
        fecha_despacho: `${dispatchDay}T16:00:00.000Z`,
        numero_bol: `BOL-${sfx}`,
        temperatura_f: 34,
        final_pallet_unit_prices: { [String(formatRes.body.id)]: unitPrice },
      })
      .expect(201);

    await request(server).post(`/api/dispatches/${dispatchRes.body.id}/confirm`).set('Authorization', `Bearer ${operatorToken}`).expect(201);
    await request(server).post(`/api/dispatches/${dispatchRes.body.id}/packing-list/generate`).set('Authorization', `Bearer ${operatorToken}`).expect(201);
    await request(server).post(`/api/dispatches/${dispatchRes.body.id}/invoice/generate`).set('Authorization', `Bearer ${operatorToken}`).expect(201);

    const settlementRes = await request(server)
      .get('/api/reporting/producer-settlement')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ fecha_desde: dispatchDay, fecha_hasta: dispatchDay, page: 1, limit: 100 })
      .expect(200);

    const ev = settlementEvidence('ESCENARIO_1_PALLET_SIMPLE', settlementRes.body as Record<string, unknown>);

    const summaryRows = ev.producerSettlementSummary.rows as Array<{
      productor_id: number | null;
      cajas: number;
      lb: number;
      ventas: number;
      costo_materiales: number;
      costo_packing: number;
      costo_total: number;
      neto_productor: number;
    }>;

    const nullProd = summaryRows.filter((r) => r.productor_id == null);
    expect(nullProd.length).toBe(0);

    const prodRow = summaryRows.find((r) => r.productor_id === producerRes.body.id);
    expect(prodRow).toBeDefined();
    expect(prodRow!.cajas).toBeCloseTo(10, 3);
    expect(prodRow!.ventas).toBeCloseTo(10 * unitPrice, 2);
    expect(prodRow!.costo_packing).toBeGreaterThan(0);
    const lbFacturadosS1 = Number(prodRow!.lb);
    expect(prodRow!.costo_packing).toBeCloseTo(lbFacturadosS1 * pricePackingPerLbS1, 1);

    const allowedSources = ['pt_tag_items', 'fruit_process_tarja', 'invoice_fruit_process', 'final_pallet_lines'];
    for (const line of ev.invoice_line_diagnostics) {
      expect(allowedSources).toContain(line.resolucion_source);
      expect(line.aporte_liquidacion).toBe('si');
    }

    const totalVentas = summaryRows.reduce((a, r) => a + Number(r.ventas), 0);
    expect(totalVentas).toBeCloseTo(10 * unitPrice, 2);
    const totalNeto = summaryRows.reduce((a, r) => a + Number(r.neto_productor), 0);
    const totalCost = summaryRows.reduce((a, r) => a + Number(r.costo_total), 0);
    expect(totalNeto).toBeCloseTo(totalVentas - totalCost, 2);
  });

  it('Escenario 2: unión por repalet — 2 productores, reparto vía repallet_provenance', async () => {
    const server = app.getHttpServer();
    const sfx = `L2${Date.now()}`;
    const dispatchDay = uniqueDispatchDay(5000);

    const loginAdmin = await request(server).post('/api/auth/login').send({ username: 'admin', password: 'admin123' }).expect(201);
    const adminToken = loginAdmin.body.access_token as string;
    const loginSupervisor = await request(server).post('/api/auth/login').send({ username: 'supervisor', password: 'sup123' }).expect(201);
    const supervisorToken = loginSupervisor.body.access_token as string;
    const loginOperator = await request(server).post('/api/auth/login').send({ username: 'operator', password: 'op123' }).expect(201);
    const operatorToken = loginOperator.body.access_token as string;
    const ds = app.get(DataSource);

    await ensureDocumentStateMercadoRecType(supervisorToken, server);
    await seedMaterialCategories(supervisorToken, server);

    const formatCode = uniqueFormatCode(9);
    const speciesRes = await request(server)
      .post('/api/masters/species')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ codigo: `ARB2-${sfx}`, nombre: `Arándano2 ${sfx}` })
      .expect(201);

    const producerA = await request(server)
      .post('/api/masters/producers')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ codigo: `PA-${sfx}`, nombre: `ProdA ${sfx}` })
      .expect(201);
    const producerB = await request(server)
      .post('/api/masters/producers')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ codigo: `PB-${sfx}`, nombre: `ProdB ${sfx}` })
      .expect(201);

    const pricePackingPerLbS2 = 0.38;
    await request(server)
      .post('/api/reporting/packing-costs')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ species_id: speciesRes.body.id, price_per_lb: pricePackingPerLbS2, active: true })
      .expect(201);

    const varietyRes = await request(server)
      .post('/api/masters/varieties')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ species_id: speciesRes.body.id, codigo: `V2-${sfx}`, nombre: `Var ${sfx}` })
      .expect(201);

    const formatRes = await request(server)
      .post('/api/masters/presentation-formats')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        format_code: formatCode,
        species_id: speciesRes.body.id,
        net_weight_lb_per_box: 13.5,
        max_boxes_per_pallet: 100,
      })
      .expect(201);

    const qualityGradeRes = await request(server)
      .post('/api/masters/quality-grades')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ codigo: `Q2-${sfx}`, nombre: `Cal2 ${sfx}`, purpose: 'exportacion' })
      .expect(201);

    const returnableRes = await request(server)
      .post('/api/masters/returnable-containers')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ tipo: 'Bin', capacidad: `R2-${sfx}` })
      .expect(201);

    const clientRes = await request(server)
      .post('/api/masters/clients')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ codigo: `CL2-${sfx}`, nombre: `Cli2 ${sfx}` })
      .expect(201);

    const brandRes = await request(server)
      .post('/api/masters/brands')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ codigo: `BR2-${sfx}`, nombre: `Br2 ${sfx}`, client_id: clientRes.body.id })
      .expect(201);

    const mkReception = (producerId: number, doc: string) =>
      request(server)
        .post('/api/receptions')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          received_at: `${dispatchDay}T08:00:00.000Z`,
          document_number: doc,
          producer_id: producerId,
          variety_id: varietyRes.body.id,
          lines: [
            {
              species_id: speciesRes.body.id,
              variety_id: varietyRes.body.id,
              quality_grade_id: qualityGradeRes.body.id,
              returnable_container_id: returnableRes.body.id,
              quantity: 1,
              net_lb: 5000,
            },
          ],
        })
        .expect(201);

    const recA = await mkReception(producerA.body.id, `REC-A-${sfx}`);
    const recB = await mkReception(producerB.body.id, `REC-B-${sfx}`);
    const lineA = recA.body.lines[0].id as number;
    const lineB = recB.body.lines[0].id as number;

    const procA = await request(server)
      .post('/api/processes')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        producer_id: producerA.body.id,
        allocations: [{ reception_line_id: lineA, lb_allocated: 1500 }],
        fecha_proceso: `${dispatchDay}T09:00:00.000Z`,
        resultado: 'IQF',
      })
      .expect(201);
    const procB = await request(server)
      .post('/api/processes')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        producer_id: producerB.body.id,
        allocations: [{ reception_line_id: lineB, lb_allocated: 1500 }],
        fecha_proceso: `${dispatchDay}T09:30:00.000Z`,
        resultado: 'IQF',
      })
      .expect(201);

    const linePayload = (processId: number, boxes: number, lbs: number) => ({
      fruit_process_id: processId,
      fecha: `${dispatchDay}T11:00:00.000Z`,
      variedad_id: varietyRes.body.id,
      amount: boxes,
      pounds: lbs,
      net_lb: lbs,
    });

    const palletA = await request(server)
      .post('/api/final-pallets')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        species_id: speciesRes.body.id,
        status: 'definitivo',
        clamshell_label: `C ${sfx}`,
        brand_id: brandRes.body.id,
        dispatch_unit: 'CHEP',
        packing_type: 'Exportadora',
        market: 'USA',
        client_id: clientRes.body.id,
        fruit_quality_mode: 'proceso',
        presentation_format_id: formatRes.body.id,
        lines: [linePayload(procA.body.id, 6, 81)],
      })
      .expect(201);

    const palletB = await request(server)
      .post('/api/final-pallets')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        species_id: speciesRes.body.id,
        status: 'definitivo',
        clamshell_label: `C ${sfx}`,
        brand_id: brandRes.body.id,
        dispatch_unit: 'CHEP',
        packing_type: 'Exportadora',
        market: 'USA',
        client_id: clientRes.body.id,
        fruit_quality_mode: 'proceso',
        presentation_format_id: formatRes.body.id,
        lines: [linePayload(procB.body.id, 4, 54)],
      })
      .expect(201);

    const repalletRes = await request(server)
      .post('/api/final-pallets/repallet')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        sources: [
          { final_pallet_id: palletA.body.id, boxes: 6 },
          { final_pallet_id: palletB.body.id, boxes: 4 },
        ],
        notes: `e2e liquidación ${sfx}`,
      })
      .expect(201);

    const resultId = repalletRes.body.id as number;
    expect(repalletRes.body.totals.amount).toBe(10);

    await ds.query(`UPDATE final_pallet_lines SET fruit_process_id = NULL WHERE final_pallet_id = $1`, [resultId]);

    const clamshell = await request(server)
      .post('/api/packaging/materials')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        nombre_material: `Cl2-${sfx}`,
        material_category_id: await matCatId(supervisorToken, server, 'clamshell'),
        unidad_medida: 'unit',
        costo_unitario: 0.33,
        cantidad_disponible: 10000,
      })
      .expect(201);

    const recipe = await request(server)
      .post('/api/packaging/recipes')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ presentation_format_id: formatRes.body.id, descripcion: `R2 ${sfx}` })
      .expect(201);

    await request(server)
      .post(`/api/packaging/recipes/${recipe.body.id}/items`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ material_id: clamshell.body.id, qty_per_unit: 12, base_unidad: 'box' })
      .expect(201);

    const ptPlRes = await request(server).post('/api/pt-packing-lists').set('Authorization', `Bearer ${operatorToken}`).send({ final_pallet_ids: [resultId] }).expect(201);
    await request(server).post(`/api/pt-packing-lists/${ptPlRes.body.id}/confirm`).set('Authorization', `Bearer ${operatorToken}`).expect(201);

    const soRes = await request(server)
      .post('/api/sales-orders')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        cliente_id: clientRes.body.id,
        lines: [{ presentation_format_id: formatRes.body.id, requested_boxes: 300, unit_price: null, brand_id: null, variety_id: null }],
      })
      .expect(201);

    const unitPrice = 24;
    const dispatchRes = await request(server)
      .post('/api/dispatches')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        pt_packing_list_ids: [ptPlRes.body.id],
        orden_id: soRes.body.id,
        cliente_id: clientRes.body.id,
        fecha_despacho: `${dispatchDay}T17:00:00.000Z`,
        numero_bol: `B2-${sfx}`,
        temperatura_f: 33,
        final_pallet_unit_prices: { [String(formatRes.body.id)]: unitPrice },
      })
      .expect(201);

    await request(server).post(`/api/dispatches/${dispatchRes.body.id}/confirm`).set('Authorization', `Bearer ${operatorToken}`).expect(201);
    await request(server).post(`/api/dispatches/${dispatchRes.body.id}/packing-list/generate`).set('Authorization', `Bearer ${operatorToken}`).expect(201);
    await request(server).post(`/api/dispatches/${dispatchRes.body.id}/invoice/generate`).set('Authorization', `Bearer ${operatorToken}`).expect(201);

    const settlementRes = await request(server)
      .get('/api/reporting/producer-settlement')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ fecha_desde: dispatchDay, fecha_hasta: dispatchDay, page: 1, limit: 100 })
      .expect(200);

    const ev = settlementEvidence('ESCENARIO_2_REPALLET_UNION', settlementRes.body as Record<string, unknown>);

    for (const line of ev.invoice_line_diagnostics) {
      expect(line.resolucion_source).toBe('repallet_provenance');
      expect(['repallet_provenance', 'repallet_multiproductor']).toContain(line.resolucion_productor);
      expect(line.aporte_liquidacion).toBe('si');
    }

    const summaryRows2 = ev.producerSettlementSummary.rows as Array<{
      productor_id: number | null;
      cajas: number;
      lb: number;
      ventas: number;
      costo_packing: number;
      costo_total: number;
      neto_productor: number;
    }>;
    expect(summaryRows2.filter((r) => r.productor_id == null).length).toBe(0);
    expect(summaryRows2.length).toBe(2);

    const rowPa = summaryRows2.find((r) => r.productor_id === producerA.body.id);
    const rowPb = summaryRows2.find((r) => r.productor_id === producerB.body.id);
    expect(rowPa!.cajas).toBeCloseTo(6, 3);
    expect(rowPb!.cajas).toBeCloseTo(4, 3);
    expect(rowPa!.costo_packing).toBeGreaterThan(0);
    expect(rowPb!.costo_packing).toBeGreaterThan(0);
    const lbTotalesFormato = rowPa!.lb + rowPb!.lb;
    const packingFormatoTotal = lbTotalesFormato * pricePackingPerLbS2;
    expect(rowPa!.costo_packing).toBeCloseTo(packingFormatoTotal * 0.6, 1);
    expect(rowPb!.costo_packing).toBeCloseTo(packingFormatoTotal * 0.4, 1);
    expect(summaryRows2.reduce((a, r) => a + Number(r.costo_packing), 0)).toBeCloseTo(packingFormatoTotal, 1);

    const totalCajasS = summaryRows2.reduce((a, r) => a + Number(r.cajas), 0);
    const totalVentasS = summaryRows2.reduce((a, r) => a + Number(r.ventas), 0);
    const totalCostS = summaryRows2.reduce((a, r) => a + Number(r.costo_total), 0);
    const totalNetoS = summaryRows2.reduce((a, r) => a + Number(r.neto_productor), 0);
    expect(totalCajasS).toBeCloseTo(10, 3);
    expect(totalVentasS).toBeCloseTo(10 * unitPrice, 2);
    expect(totalNetoS).toBeCloseTo(totalVentasS - totalCostS, 2);

    const detailRows2 = ev.producerSettlementDetail.rows as Array<{
      cajas: number;
      ventas: number;
      costo_total: number;
      neto: number;
    }>;
    const totalCajasD = detailRows2.reduce((a, r) => a + Number(r.cajas), 0);
    const totalVentasD = detailRows2.reduce((a, r) => a + Number(r.ventas), 0);
    const totalCostD = detailRows2.reduce((a, r) => a + Number(r.costo_total), 0);
    const totalNetoD = detailRows2.reduce((a, r) => a + Number(r.neto), 0);
    expect(totalCajasD).toBeCloseTo(10, 3);
    expect(totalVentasD).toBeCloseTo(10 * unitPrice, 2);
    expect(totalVentasD - totalCostD).toBeCloseTo(totalNetoD, 2);
  });
});

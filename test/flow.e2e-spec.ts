import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../src/modules/auth/auth.module';
import { DispatchBillingModule } from '../src/modules/dispatch/dispatch-billing.module';
import { ProcessModule } from '../src/modules/process/process.module';
import { Dispatch, DispatchTagItem, Invoice, InvoiceItem, PackingList, SalesOrder, SalesOrderModification } from '../src/modules/dispatch/dispatch.entities';
import { FruitProcess, PtTag, PtTagAudit, PtTagItem } from '../src/modules/process/process.entities';
import { PackagingModule } from '../src/modules/packaging/packaging.module';
import {
  PackagingCostBreakdown,
  PackagingMaterial,
  PackagingPalletConsumption,
  PackagingRecipe,
  PackagingRecipeItem,
} from '../src/modules/packaging/packaging.entities';
import { ReportingModule } from '../src/modules/reporting/reporting.module';
import { ReportSnapshot } from '../src/modules/reporting/reporting.entities';
import { PlantModule } from '../src/modules/plant/plant.module';
import { PlantSettings } from '../src/modules/plant/plant.entities';

jest.setTimeout(60000);

describe('End-to-end packing flow', () => {
  let app!: INestApplication;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-e2e';

    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          // sql.js evita el binario nativo de sqlite3 (fallos frecuentes en Windows/Jest).
          type: 'sqljs',
          location: ':memory:',
          autoSave: false,
          entities: [
            FruitProcess,
            PtTag,
            PtTagItem,
            PtTagAudit,
            SalesOrder,
            SalesOrderModification,
            Dispatch,
            DispatchTagItem,
            PackingList,
            Invoice,
            InvoiceItem,
            PackagingMaterial,
            PackagingRecipe,
            PackagingRecipeItem,
            PackagingPalletConsumption,
            PackagingCostBreakdown,
            ReportSnapshot,
            PlantSettings,
          ],
          synchronize: true,
        }),
        AuthModule,
        ProcessModule,
        DispatchBillingModule,
        PackagingModule,
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

    const processRes = await request(app.getHttpServer())
      .post('/api/processes')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        recepcion_id: 1,
        fecha_proceso: '2026-04-07T10:00:00.000Z',
        productor_id: 10,
        variedad_id: 2,
        peso_procesado_lb: 900,
        merma_lb: 100,
        resultado: 'IQF',
      })
      .expect(201);

    const tagRes = await request(app.getHttpServer())
      .post('/api/pt-tags')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        fecha: '2026-04-07T10:00:00.000Z',
        resultado: 'IQF',
        format_code: '12x18oz',
        cajas_por_pallet: 100,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/pt-tags/${tagRes.body.id}/items`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        process_id: processRes.body.id,
      })
      .expect(201);

    const soRes = await request(app.getHttpServer())
      .post('/api/sales-orders')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        cliente_id: 20,
        requested_pallets: 20,
        requested_boxes: 2000,
      })
      .expect(201);

    const dispatchRes = await request(app.getHttpServer())
      .post('/api/dispatches')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        orden_id: soRes.body.id,
        cliente_id: 20,
        fecha_despacho: '2026-04-07T16:00:00.000Z',
        numero_bol: 'BOL-001',
        temperatura_f: 34,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/dispatches/${dispatchRes.body.id}/tags`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        tarja_id: tagRes.body.id,
        cajas_despachadas: 100,
        pallets_despachados: 1,
        unit_price: 22.5,
        pallet_cost: 1400,
      })
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

    const clamshell = await request(app.getHttpServer())
      .post('/api/packaging/materials')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        nombre_material: 'Clamshell 18oz',
        categoria: 'clamshell',
        unidad_medida: 'unit',
        costo_unitario: 0.4,
        cantidad_disponible: 10000,
      })
      .expect(201);

    const tape = await request(app.getHttpServer())
      .post('/api/packaging/materials')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        nombre_material: 'Tape',
        categoria: 'tape',
        unidad_medida: 'm',
        costo_unitario: 0.08,
        cantidad_disponible: 2000,
      })
      .expect(201);

    const corner = await request(app.getHttpServer())
      .post('/api/packaging/materials')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        nombre_material: 'Corner Board',
        categoria: 'corner_board',
        unidad_medida: 'unit',
        costo_unitario: 1.2,
        cantidad_disponible: 1000,
      })
      .expect(201);

    const etiqueta = await request(app.getHttpServer())
      .post('/api/packaging/materials')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        nombre_material: 'Etiqueta PT',
        categoria: 'etiqueta',
        unidad_medida: 'unit',
        costo_unitario: 0.05,
        cantidad_disponible: 2000,
      })
      .expect(201);

    const recipe = await request(app.getHttpServer())
      .post('/api/packaging/recipes')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        format_code: '12x18oz',
        descripcion: 'Receta base 12x18oz',
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

    expect(Number(clamshellAfter.cantidad_disponible)).toBeLessThan(10000);
    expect(Number(tapeAfter.cantidad_disponible)).toBeLessThan(2000);
    expect(Number(cornerAfter.cantidad_disponible)).toBeLessThan(1000);
    expect(Number(etiquetaAfter.cantidad_disponible)).toBeLessThan(2000);

    await request(app.getHttpServer()).put(`/api/pt-tags/${tagRes.body.id}`).send({
      format_code: '12x18oz',
      cajas_por_pallet: 80,
    }).expect(401);

    await request(app.getHttpServer()).put(`/api/pt-tags/${tagRes.body.id}`).set('Authorization', `Bearer ${adminToken}`).send({
      format_code: '12x18oz',
      cajas_por_pallet: 80,
    }).expect(200);

    await request(app.getHttpServer()).put(`/api/sales-orders/${soRes.body.id}`).send({
      requested_pallets: 15,
      requested_boxes: 1500,
    }).expect(401);

    await request(app.getHttpServer()).put(`/api/sales-orders/${soRes.body.id}`).set('Authorization', `Bearer ${supervisorToken}`).send({
      requested_pallets: 15,
      requested_boxes: 1500,
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

    const reportRes = await request(app.getHttpServer()).get('/api/reporting/generate').set('Authorization', `Bearer ${operatorToken}`).query({
      productor_id: 10,
      tarja_id: tagRes.body.id,
      page: 1,
      limit: 10,
    }).expect(200);

    expect(reportRes.body.boxesByProducer).toHaveProperty('rows');
    expect(reportRes.body).toHaveProperty('plant_thresholds');

    const csvExport = await request(app.getHttpServer()).get('/api/reporting/export').set('Authorization', `Bearer ${adminToken}`).query({
      format: 'csv',
      productor_id: 10,
    }).expect(200);

    expect(csvExport.headers['content-type']).toMatch(/text\/csv/);

    const savedReport = await request(app.getHttpServer()).post('/api/reporting/saved-reports').set('Authorization', `Bearer ${adminToken}`).send({
      report_name: 'Reporte operativo',
      filters: { productor_id: 10 },
      payload: reportRes.body,
    }).expect(201);

    await request(app.getHttpServer()).put(`/api/reporting/saved-reports/${savedReport.body.id}`).set('Authorization', `Bearer ${supervisorToken}`).send({
      report_name: 'Reporte operativo actualizado',
      filters: { productor_id: 10, tarja_id: tagRes.body.id },
      payload: reportRes.body,
    }).expect(200);

    await request(app.getHttpServer()).delete(`/api/reporting/saved-reports/${savedReport.body.id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
  });
});

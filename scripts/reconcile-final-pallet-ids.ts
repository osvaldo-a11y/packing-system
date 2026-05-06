import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FinalPalletService } from '../src/modules/final-pallet/final-pallet.service';

/** Una línea por llamada Nest reconcileFinishedPtStockForPallet (inventario PT agregado). */
async function main() {
  const raw = process.env.RECONCILE_FINAL_PALLET_IDS || '';
  const ids = [
    ...new Set(
      raw
        .split(',')
        .map((s) => Number(String(s).trim()))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];
  if (ids.length === 0) {
    console.log('RECONCILE_FINAL_PALLET_IDS vacío; omitiendo reconcile Nest.');
    return;
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const svc = app.get(FinalPalletService);
    for (const id of ids) {
      await svc.reconcileInventoryForPallet(id);
      console.log('OK reconcileInventoryForPallet(', id, ')');
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

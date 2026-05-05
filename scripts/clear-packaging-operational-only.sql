-- =============================================================================
-- Solo datos operativos de empaque (consumos PT, breakdowns, kardex).
-- NO toca recepciones, tarjas, despachos, pedidos ni el resto de la operación.
--
-- Ejecutar antes de clear-packaging-catalog.sql (materiales/recetas).
-- Uso: lo invoca scripts/clear-packaging-catalog.cjs (npm run dev:clear-packaging).
-- =============================================================================
BEGIN;

TRUNCATE TABLE
  packaging_cost_breakdowns,
  packaging_pallet_consumptions,
  packaging_material_movements
RESTART IDENTITY CASCADE;

COMMIT;

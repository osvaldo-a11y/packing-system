-- =============================================================================
-- ADVERTENCIA: borra datos operativos de la base (desarrollo / pruebas).
-- No ejecutar en producción sin backup.
-- Mantiene maestros (clientes, marcas, formatos, especies, materiales, recetas,
-- costos lb por especie en packing_costs, categorías, usuarios de auth, plant_settings).
--
-- Vacía: recepciones, procesos, despachos (y facturas/PL asociados), tarjas PT,
-- pallets finales e inventario PT, pedidos, repaletizaje, PL PT, stock agregado PT,
-- snapshots de reportes, movimientos de empaque (kardex) y consumos por pallet.
--
-- REINICIA secuencias (siguiente id = 1) para esas tablas.
--
-- Uso:
--   npm run dev:clear-data
--   o: psql "$DATABASE_URL" -f scripts/clear-dev-data.sql
--
-- Para también vaciar materiales y recetas de empaque: npm run dev:clear-packaging
-- =============================================================================
BEGIN;

TRUNCATE TABLE
  packaging_cost_breakdowns,
  packaging_pallet_consumptions,
  packaging_material_movements,
  invoice_items,
  invoices,
  packing_lists,
  dispatch_tag_items,
  dispatch_pt_packing_lists,
  repallet_line_provenance,
  repallet_reversals,
  repallet_sources,
  repallet_events,
  pt_packing_list_items,
  pt_packing_list_reversal_events,
  finished_pt_inventory,
  final_pallet_lines,
  pt_packing_lists,
  fruit_process_component_values,
  fruit_process_line_allocations,
  raw_material_movements,
  pt_tag_merge_sources,
  pt_tag_lineage,
  pt_tag_audits,
  pt_tag_items,
  pt_tag_merges,
  pt_tags,
  fruit_processes,
  reception_lines,
  receptions,
  final_pallets,
  dispatches,
  sales_order_modifications,
  sales_order_lines,
  sales_orders,
  finished_pt_stock,
  report_snapshots
RESTART IDENTITY;

COMMIT;

-- =============================================================================
-- ADVERTENCIA: borra datos operativos de la base (desarrollo / pruebas).
-- No ejecutar en producción. Hacer backup antes.
-- Mantiene maestros (clientes, formatos, especies, packing_costs, recetas, etc.).
--
-- Clasificación maestros vs transaccionales: scripts/TABLES-MAESTROS-VS-TRANSACCIONALES.md
-- Flujo limpieza + siembra de validación: scripts/VALIDATION_RUNBOOK.md
--
-- Uso:
--   npm run dev:clear-data
--   o: psql "postgresql://USER:PASS@HOST:PORT/DB" -f scripts/clear-dev-data.sql
-- =============================================================================
BEGIN;

DELETE FROM report_snapshots;

DELETE FROM packaging_cost_breakdowns;
DELETE FROM packaging_pallet_consumptions;
DELETE FROM packaging_material_movements;

DELETE FROM invoice_items;
DELETE FROM invoices;
DELETE FROM packing_lists;
DELETE FROM dispatch_tag_items;

DELETE FROM dispatch_pt_packing_lists;

UPDATE final_pallets
SET
  dispatch_id = NULL,
  pt_packing_list_id = NULL,
  planned_sales_order_id = NULL
WHERE dispatch_id IS NOT NULL
   OR pt_packing_list_id IS NOT NULL
   OR planned_sales_order_id IS NOT NULL;

DELETE FROM pt_packing_list_items;
DELETE FROM pt_packing_list_reversal_events;
DELETE FROM pt_packing_lists;

DELETE FROM repallet_line_provenance;
DELETE FROM repallet_sources;
DELETE FROM repallet_reversals;
DELETE FROM repallet_events;

DELETE FROM finished_pt_inventory;
DELETE FROM final_pallet_lines;
DELETE FROM final_pallets;

DELETE FROM dispatches;

DELETE FROM sales_order_modifications;
DELETE FROM sales_order_lines;
DELETE FROM sales_orders;

DELETE FROM fruit_process_component_values;
DELETE FROM fruit_process_line_allocations;
DELETE FROM raw_material_movements;
DELETE FROM pt_tag_lineage;
DELETE FROM pt_tag_merge_sources;
DELETE FROM pt_tag_merges;
DELETE FROM pt_tag_audits;
DELETE FROM pt_tag_items;
DELETE FROM pt_tags;
DELETE FROM fruit_processes;
DELETE FROM reception_lines;
DELETE FROM receptions;

DELETE FROM finished_pt_stock;

COMMIT;

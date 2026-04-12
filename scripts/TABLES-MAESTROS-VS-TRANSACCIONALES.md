# Maestros vs datos transaccionales (Postgres)

Referencia para `scripts/clear-dev-data.sql`: **solo se borran filas transaccionales**; los maestros y la configuración persistente se conservan.

## Maestros y configuración (no se borran con `dev:clear-data`)

| Área | Tablas típicas |
|------|------------------|
| Taxonomía / producto | `species`, `varieties`, `producers`, `presentation_formats`, `quality_grades` |
| Catálogo UI | `mercados`, `material_categories`, `reception_types`, `document_states` |
| Operativos maestros | `clients`, `brands`, `packing_suppliers`, `packing_material_suppliers`, `returnable_containers` |
| Proceso / máquinas | `process_machines`, `process_result_components`, `species_process_result_component` |
| Embalaje maestro | `packaging_materials`, `packaging_recipes`, `packaging_recipe_items` |
| Costos / planta | `packing_costs` (precio packing por especie), `plant_settings` |
| Autenticación | usuarios vía `AUTH_USERS_JSON` (no hay tabla `users` en DB por defecto) |

## Transaccionales (sí se borran con `npm run dev:clear-data`)

| Flujo | Tablas |
|-------|--------|
| Recepción MP | `receptions`, `reception_lines` |
| Proceso / tarjas | `fruit_processes`, `fruit_process_component_values`, `fruit_process_line_allocations`, `raw_material_movements`, `pt_tags`, `pt_tag_items`, `pt_tag_audits`, `pt_tag_lineage`, `pt_tag_merges`, `pt_tag_merge_sources` |
| Pallets finales / inventario | `final_pallets`, `final_pallet_lines`, `finished_pt_inventory`, `finished_pt_stock` |
| Repalet | `repallet_events`, `repallet_sources`, `repallet_line_provenance`, `repallet_reversals` |
| Packing lists PT | `pt_packing_lists`, `pt_packing_list_items`, `pt_packing_list_reversal_events` |
| Comercial | `sales_orders`, `sales_order_lines`, `sales_order_modifications`, `dispatches`, `dispatch_pt_packing_lists`, `dispatch_tag_items`, `packing_lists`, `invoices`, `invoice_items` |
| Embalaje consumos | `packaging_pallet_consumptions`, `packaging_cost_breakdowns`, `packaging_material_movements` |
| Reportes | `report_snapshots` |

**Nota:** `packing_costs` y recetas/materiales **no** se limpian: son la base para costo por formato y liquidación.

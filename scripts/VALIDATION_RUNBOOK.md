# Base limpia y validación punta a punta

## 1. Limpieza controlada

```bash
# Requiere Postgres según .env y dependencias instaladas (pg en package.json ya está).
npm run dev:clear-data
```

Qué hace: ejecuta `scripts/clear-dev-data.sql` (transaccional únicamente; maestros intactos). Detalle de tablas: `TABLES-MAESTROS-VS-TRANSACCIONALES.md`.

**Tablas vaciadas (orden del script):**  
`report_snapshots` → `packaging_cost_breakdowns`, `packaging_pallet_consumptions`, `packaging_material_movements` → `invoice_items`, `invoices` → `packing_lists` → `dispatch_tag_items` → `dispatch_pt_packing_lists` → (FKs en `final_pallets` a despacho/PL/pedido anulados) → `pt_packing_list_items`, `pt_packing_list_reversal_events`, `pt_packing_lists` → `repallet_line_provenance`, `repallet_sources`, `repallet_reversals`, `repallet_events` → `finished_pt_inventory` → `final_pallet_lines`, `final_pallets` → `dispatches` → `sales_order_modifications`, `sales_order_lines`, `sales_orders` → `fruit_process_component_values`, `fruit_process_line_allocations`, `raw_material_movements`, `pt_tag_*`, `pt_tags`, `fruit_processes`, `reception_lines`, `receptions` → `finished_pt_stock`.

**No se borra:**  
`packing_costs`, `plant_settings`, `species`, `producers`, `varieties`, `presentation_formats`, `clients`, `packaging_materials`, `packaging_recipes`, etc.

**Antes de producción:** no ejecutar; hacer backup.

## 2. Carga mínima automatizada (API)

Con el **API en marcha** (`node dist/main.js` o `npm run start`) y usuarios de `.env` (p. ej. supervisor/operator):

```bash
# Opcional: API_BASE=http://127.0.0.1:3000
npm run seed:validation
```

El script `scripts/seed-validation-flow.cjs`:

- Crea maestros con códigos únicos (`VAL…`) para no chocar con datos viejos.
- **Escenario A:** 1 recepción → 1 proceso → 1 tarja PT → 1 pallet final → packing list PT → despacho → factura.
- **Escenario B:** 2 recepciones (2 productores) → 2 procesos → 2 pallets finales → **repalet** que los une → PL → despacho → factura sobre el pallet resultado.
- Configura **costo packing por especie** y **materiales + receta** mínimos para el formato usado.

Al final imprime un JSON con **IDs y códigos** para pruebas manuales.

## 3. Qué validar manualmente (UI / Excel / PDF)

| Objetivo | Dónde / cómo |
|----------|----------------|
| Liquidación por productor | `#/reporting` → pestaña Financiero → generar; PDF liquidación productor |
| Margen por cliente | Mismo reporte, filtros `cliente_id` / fechas |
| Costo por formato | Bloque costos / liquidación (misma generación) |
| Packing list / despacho / factura | Pantallas Despachos, Existencias PT, Packing lists |

Filtros de fechas: usar el **rango que cubra las fechas de despacho** de los escenarios (el script usa fechas fijas en 2026).

## 4. Confirmación “sin basura”

Tras `dev:clear-data`, `report_snapshots` queda vacío; no quedan facturas/despachos viejos. Los únicos datos operativos son los del `seed:validation` (más maestros previos no borrados).

Si necesitás **maestros también limpios**, hay que borrar manualmente por SQL o UI (no incluido en `clear-dev-data.sql` por diseño).

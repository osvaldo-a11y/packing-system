# Bloque 2.5 — Arquitectura multi-especie

Documento de diseño aprobado e implementado incrementalmente.

Baseline UX: `ux/packing-operational-redesign` @ `4a288a1d` (ReceptionPage no modificado en este bloque).

## Decisiones (Q1–10)

1. **Híbrido**: `species.flow_type` (`PROCESSED` | `DIRECT`) + capabilities derivadas.
2. **Inventario RAW**: reutilizar `reception_line` + allocations/adjustments (no ledger genérico MVP).
3. **Dispatch único** con junction `dispatch_reception_lines` / `source_kind`.
4. **SalesOrderLine única** extendida con `line_kind` (`PT_FORMAT` | `RAW_WEIGHT`).
5. **PtPackingList** sigue exclusiva de PT.
6. Stock Orange = available de `reception_line` (API raw-stock).
7. Anti doble consumo: `available = net − process − direct − adjustments` + `FOR UPDATE`.
8. Migrations: ver `1780300000000-SpeciesFlowAndRawDispatch.ts`.
9. Riesgo Blueberry: defaults PROCESSED / PT_PL mantienen path histórico.
10. MVP Orange: A→D (flow + balance + SO RAW + dispatch/invoice RAW).

Ver plan adjunto en artifacts para detalle A–P completo.

## Implementación (fases)

| Fase | Entrega |
|------|---------|
| **2.5A** | `species.flow_type`, migration backfill DIRECT, masters API con `capabilities` |
| **2.5B** | `RawInventoryService` balance unificado, `GET/POST /api/raw-stock*`, Process filtra DIRECT |
| **2.5C** | `SalesOrderLine.line_kind` PT_FORMAT\|RAW_WEIGHT + progress RAW por lb |
| **2.5D** | Dispatch `source_kind` + `dispatch_reception_lines`, invoice RAW, locking `FOR UPDATE` |
| **2.5E** | Dashboard DIRECT = received−dispatched; mass balance `direct_producers` |
| **2.5F** | Settlement DIRECT (ventas − fee simple); BOL usa `species.nombre` (sin hardcode) |

ReceptionPage **sin cambios** en este bloque.

# Consumos — modelo analítico (referencia oficial)

Este documento describe **el único modelo** que usa hoy el panel **Consumos** (`/packaging/consumptions`): cálculos por **material** y **formato**, alineados con el inventario de empaque del backend. Sirve para compras y auditoría; no sustituye la documentación de API de Nest, pero es la referencia de negocio del módulo.

---

## Definiciones (orden lógico)

### 1. Consumo teórico

**Consumo teórico** = suma, para cada **unidad PT** incluida en el filtro, de lo que exige la **receta aplicable** a esa PT.

- **PT incluidas**: mismas reglas que antes — cuentan para totales de producción (`countsTowardPtProductionTotals`) y coinciden con el **formato** de la tarjeta; el filtro **Alcance cliente** restringe qué PT entran (`tagMatchesCapClient`).
- **Receta aplicable**: `findRecipeForTag` — recetas activas con el mismo `format_code` (normalizado), prioridad por marca de la tarja y luego genérica.
- **Por línea de receta**:  
  `consumo_material += qty_per_unit × factor`  
  donde `factor = cajas de la PT` si `base_unidad === 'box'`, y `factor = pallets equivalentes` (cajas ÷ cajas por pallet del formato del maestro) si la línea es por pallet. Solo entran materiales que pasan `materialAppliesToCapView` (alcance de formato y cliente).

En una frase: **consumo teórico = PT filtradas × receta aplicable** (expandido línea a línea).

### 2. Stock base

**Stock base** es el **saldo del material antes de descontar los consumos de empaque registrados en kardex** (es decir, el saldo “previo” al descuento por `packaging_cost_breakdowns`).

En el API de listado de materiales se expone como:

`stock_base = cantidad_disponible + Σ(qty_used en breakdowns por material)`

Esto coincide con el **modelo B** del backend:  
`cantidad_disponible = stock_inicial + Σ(movimientos no consumo) − Σ(breakdown)`,  
de donde  
`stock_inicial + Σ(mov. no consumo) = cantidad_disponible + Σ(breakdown)` = **stock base**.

El campo `qty_consumed_registered` en el mismo listado es la suma de breakdowns (transparencia).

### 3. Stock restante analítico

Por **cada material** y **cada tarjeta de formato**:

**stock restante analítico = stock base − consumo teórico**

donde el consumo teórico es solo el atribuible a las PT del **formato** (y alcance cliente) de esa tarjeta.

**Importante:** el stock base es **único por material** (saldo global). En cada tarjeta se resta únicamente el consumo teórico de las PT de **ese** formato. Si un material participa en varios formatos, cada tarjeta muestra una vista analítica **parcial**; los restantes no son aditivos entre tarjetas sin consolidar.

### 4. Requerimiento por contenedor

Referencia: **24 pallets por contenedor** (`CONTAINER_PALLETS_REF`).

Por línea de receta (mismo alcance):

- **Directo × caja** (con cajas por pallet del formato) →  
  `requerimiento = qty_per_unit × max_boxes_per_pallet × 24`
- **Tripaje × pallet** o **directo × pallet** →  
  `requerimiento = qty_per_unit × 24`

Si un material aparece en varias líneas del mismo formato, se toma el **máximo** de requerimiento entre esas líneas (mismo criterio que antes para no subestimar necesidad).

### 5. Cobertura

**Cobertura (en contenedores)** = **stock restante analítico ÷ requerimiento por contenedor**

solo cuando `requerimiento > 0` y los valores son finitos.

### 6. Material limitante

**Limitante** = material con **menor cobertura** entre los que tienen:

- `consumo teórico > 0`,
- `requerimiento por contenedor > 0`,
- cobertura numérica definida.

Una sola regla para la tarjeta y el texto “Limitante” (no hay regla paralela “optimista” ni por categoría agregada).

---

## Alertas (simplificadas)

- Formato sin receta activa (sin `hasRecipe` en el resumen).
- Cobertura mínima del formato &lt; 1 contenedor (con producción teórica &gt; 0).
- Saldo analítico negativo en algún material (`stock restante &lt; 0`).

---

## Ejemplo: Caja 12x18oz

**Datos:**

- Material: **Caja 12x18oz** (un solo SKU en receta para ese insumo).
- **Stock base** (API): `9425` unidades.
- **Producción acumulada** en el formato (PT del filtro): **2147 cajas**.
- **Receta**: 1 unidad de caja por cada caja producida (`qty_per_unit = 1`, base por caja).

**Cálculo:**

| Magnitud | Valor |
|----------|--------|
| Consumo teórico | 2147 × 1 = **2147** |
| Stock restante analítico | 9425 − 2147 = **7278** |
| Cobertura | 7278 ÷ (requerimiento por contenedor de esa línea) |

Si el requerimiento por contenedor de esa línea es, por ejemplo, el que resulta de `1 × cajas_pallet × 24`, la cobertura se muestra como **7278 / ese requerimiento** (contenedores).

---

## Formato numérico en pantalla

En **Materiales**, **Kardex** y **Consumos** las cantidades de inventario usan `formatInventoryQty` / `formatInventoryQtyFromString` (`frontend/src/lib/number-format.ts`):

- **Sin separador de miles** (`useGrouping: false`) para evitar confundir “100.000” (cien mil en locale es-AR) con “cien con tres decimales”.
- **Enteros**: sin coma ni `.000` artificiales (ej. `9425`, `100`, `100000`).
- **Decimales**: coma decimal `es-AR`, máximo 2 (pallets equivalentes) u 3 (saldos finos del API), sin ceros de relleno innecesarios.
- **Cobertura** (ratio contenedores): `formatTechnical` con hasta 2 decimales — no es cantidad física, es otra escala.

---

## Qué se eliminó respecto al modelo anterior

- **Stock “híbrido” para cobertura**: ya no se usa solo `cantidad_disponible` agregado por categoría como “stock para cobertura” sin reconstruir el saldo previo a consumos registrados.
- **`logisticsByFormatCode`**: tope de cajas “optimista” solo con ítems directo × caja y otra receta elegida por máximo cuello — **eliminado**.
- **Doble limitante** (cobertura por categoría clave vs “referencia optimista” de receta) — **unificado** en menor cobertura por material.
- **Agregación por buckets** (caja / clamshell / tape / …) como eje principal de la tabla — sustituida por **filas por material** con las cuatro magnitudes.
- **Autoconsumo automático** que disparaba `POST` de consumos al cargar la página — **eliminado**.
- **Completar tape/etiqueta** desde consumos históricos cuando la receta no traía cantidad — **eliminado** del modelo simple (el teórico viene solo de PT × receta).

---

## Archivos tocados (implementación actual)

| Archivo | Rol |
|---------|-----|
| `frontend/src/pages/ConsumptionsPage.tsx` | UI del módulo; cálculos de consumo teórico, restante, cobertura y limitante; cantidades con `formatInventoryQty`. |
| `frontend/src/pages/MaterialsPage.tsx` | Tipos TS para `stock_base` y `qty_consumed_registered`; grilla y resúmenes formatean saldos con `formatInventoryQtyFromString`. |
| `frontend/src/pages/KardexPage.tsx` | Movimientos y saldos con `formatInventoryQty`. |
| `frontend/src/lib/number-format.ts` | `formatInventoryQty` / `formatInventoryQtyFromString` para el módulo empaque. |
| `src/modules/packaging/packaging.service.ts` | `listMaterials()` enriquece cada material con `stock_base` y `qty_consumed_registered` vía suma de breakdowns. |
| `frontend/docs/CONSUMOS_AUDITORIA.md` | Este documento — referencia oficial del modelo. |

---

## Recalcular consumos (kardex)

El botón **Recalcular consumos** sigue llamando al backend para alinear **consumos registrados** y **breakdowns** con las tarjas. Eso actualiza `cantidad_disponible` y, por tanto, `stock_base` en el API. No cambia el **consumo teórico** (que depende solo de PT y recetas).

---

*Última actualización: alineado al modelo simplificado analítico por material (post-refactor Consumos).*

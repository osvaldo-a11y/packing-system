# Sistema visual (frontend) — guía interna

Documento de referencia para nuevas pantallas y refactors. La fuente de verdad de clases compartidas es **`src/lib/page-ui.ts`**; el shell global está en **`src/layouts/AppLayout.tsx`**.

---

## 1. Layout base

### AppLayout

- Las rutas autenticadas renderizan el contenido dentro de `AppLayout`: sidebar (desktop), header compacto (usuario / menú móvil) y **`main`** con scroll.
- **No dupliques** `max-w-[1400px]` ni padding horizontal extra en cada página salvo casos muy puntuales (p. ej. texto largo de solo lectura con `max-w-2xl` en Acerca): el contenedor del `Outlet` ya centra y limita el ancho.

### Ancho y padding

| Elemento | Comportamiento |
|----------|----------------|
| Contenedor de página | `mx-auto w-full max-w-[1400px]` (definido en `AppLayout`, animación de ruta opcional con `key={pathname}`) |
| `main` | `px-4 py-4` → `md:px-5 md:py-5` → `lg:px-6 lg:py-6` |
| Espaciado vertical entre bloques grandes | `pageStack` → `space-y-8` |

### Estructura recomendada de página

1. **Header de módulo** (`pageHeaderRow`): título + subtítulo + acciones.
2. **KPIs** (si aplica): una o más filas con grillas `kpiGrid*` + cards.
3. **Filtros** (`filterPanel`) cuando la pantalla es lista filtrada.
4. **Sección de tabla o contenido principal** (`sectionTitle` / `sectionHint` + `tableShell` o contenido equivalente).
5. **Bloques secundarios** (señales, ayudas, formularios colapsados) debajo o al costado según flujo.

Orden visual de prioridad: **KPIs → tabla (o contenido principal) → filtros → detalles secundarios** (ajustar solo si el dominio lo exige).

---

## 2. Headers

| Pieza | Token / patrón |
|-------|----------------|
| Fila título + acciones | `pageHeaderRow` |
| Título principal (único estilo de módulo) | `pageTitle` — usar en `<h1>` o `<h2>` según jerarquía semántica |
| Subtítulo | `pageSubtitle` — una línea corta, tono discreto |
| Acciones principales | Contenedor `flex flex-wrap justify-end gap-2` a la derecha en desktop (incluido en el patrón de `pageHeaderRow`) |
| CTA principal | `btnToolbarPrimary` (y variante `Button` acorde: `size="sm"` suele alinearse con el resto) |
| Secundarias / enlaces | `btnToolbarOutline` |
| Ayuda contextual (tooltip) | `pageInfoButton` + icono `Info` — mismo patrón en todas las pantallas |

No mezcles otro tamaño de título de módulo ni otro peso de subtítulo: todo pasa por estos tokens.

---

## 3. KPIs

### Primera fila vs segunda fila

- **Primera fila**: métricas “hero” del listado (totales, rendimiento, stock agregado). Usar **`kpiCard`** + **`kpiGrid`** (u otra grilla `kpiGrid3` / `kpiGrid6` si el layout lo requiere).
- **Segunda fila (y siguientes)**: métricas complementarias o más densas. Usar **`kpiCardSm`** para igualar altura/padding algo más compactos sin romper la familia visual.

### Tokens por parte de la card

| Parte | Token |
|-------|--------|
| Contenedor | `kpiCard` / `kpiCardSm` / `kpiCardLg` (solo si hace falta más altura, p. ej. dashboard) |
| Etiqueta | `kpiLabel` |
| Valor principal | `kpiValueLg` (primera fila típica), `kpiValueMd` (secundaria), `kpiValueXl` (dashboard u héroe único) |
| Microtexto | `kpiFootnote` o `kpiFootnoteLead` si necesitás más aire arriba |

### Jerarquía y color

- Primera fila: números más grandes (`kpiValueLg` / `kpiValueXl`).
- Filas siguientes: `kpiValueMd` + `kpiCardSm`.
- Reservá **color de alerta** (ámbar, rosa, violeta, etc.) para situaciones reales (umbrales, anomalías), no para decorar.

---

## 4. Cards y bloques

| Token | Uso |
|-------|-----|
| `contentCard` | Bloques de contenido estático o formularios envueltos: bordes suaves, sombra ligera. Combinar con `cn(contentCard, 'border-dashed …')` si el diseño es “placeholder” o informativo. |
| `filterPanel` | Bloque único de filtros: fondo blanco semitransparente, borde slate suave. |
| `filterLabel` | Labels de filtros (`<Label>`). |
| `signalsPanel` + `signalsTitle` | Listas cortas de alertas operativas o avisos debajo de KPIs / encima de tabla. |
| `sectionTitle` + `sectionHint` | Título de sección + línea de ayuda bajo el título (p. ej. “Listado operativo” + conteo de filas). |
| `sectionHeadingLg` | Subtítulos de nivel guía / documentación larga. |

### Vacíos y banners

| Token | Cuándo |
|-------|--------|
| `emptyStatePanel` | Lista sin datos o sin coincidencias: bloque centrado, dashed, mucho padding vertical (`py-12`). |
| `emptyStateBanner` | Mensaje vacío **compacto** en una franja (p. ej. “Sin alertas”, aviso dentro de un panel coloreado). |
| `emptyStateInset` | Bloque dashed **dentro** de un formulario o panel (p. ej. calculadora, resumen auxiliar). |

---

## 5. Tablas

| Token | Rol |
|-------|-----|
| `tableShell` | Wrapper del `Table`: borde, sombra, scroll horizontal; anula bordes duplicados del hijo. |
| `tableHeaderRow` | `TableRow` del `<TableHeader>`. |
| `tableBodyRow` | Filas del cuerpo; hover uniforme. |
| `tableCellComfortable` | Celdas con altura cómoda (`py-3.5`) cuando aplica. |

**Reglas:** misma densidad entre módulos; cabecera sin fondo agresivo; alineación numérica con `tabular-nums` y `text-right` donde corresponda; acciones alineadas a la derecha en la última columna.

---

## 6. Estados (badges y feedback)

### `badgePill`

Base para estados tipo píldora: `cn(badgePill, 'border-emerald-200/80 bg-emerald-50 text-emerald-900')` (ejemplo). Mantener **misma forma** (altura, padding, texto ~11px) entre módulos; solo cambian colores por estado.

**Equivalencias visuales:** estados similares (borrador, confirmado, cerrado, anulado, asignado a PL, etc.) deben reutilizar la **misma paleta** que el resto de la app (slate neutro, emerald confirmado, rose anulado, violeta cerrado, etc.) — copiar el mapa de una pantalla ya homologada en lugar de inventar clases.

### Errores

| Token | Uso |
|-------|-----|
| `errorStatePanel` | Mensaje de error inline (query fallida, validación de bloque): párrafo o `div` con `role="alert"`. |
| `errorStateCard` | Card completa cuando toda la pantalla o sección falla al cargar (título + descripción). |

### Vacíos

Ver sección 4: `emptyStatePanel`, `emptyStateBanner`, `emptyStateInset`.

---

## 7. Inputs y filtros

| Token | Uso |
|-------|-----|
| `filterSelectClass` | `<select>` en barras de filtro. |
| `filterInputClass` | Inputs de filtro y muchos inputs de formulario alineados a la misma altura (`h-10`, `rounded-xl`). |

### Botones de barra (header de página)

- Principal: `btnToolbarPrimary`.
- Outline / secundario en barra: `btnToolbarOutline`.
- Acciones de tabla o terciarias: `Button` con `variant="ghost"` / `outline` / `secondary` según shadcn, manteniendo **`rounded-xl`** o **`rounded-lg`** en línea con la pantalla existente.

---

## 8. Reglas UX (obligatorio leer)

1. **No** bloques de texto largo “tipo documento” en vistas operativas; si hace falta ayuda, tooltip, panel colapsable o enlace a guía.
2. **Prioridad visual:** KPIs → tabla (o contenido principal) → filtros → detalles secundarios (salvo requisitos fuertes del flujo).
3. **Fondo:** blanco / slate muy suave; evitar fondos fuertes o bordes gruesos fuera de tokens.
4. **Evitar estilos ad hoc:** antes de escribir `rounded-2xl border …` en una página nueva, buscar en `page-ui.ts` o en una pantalla ya migrada.
5. **Sub-layouts** (p. ej. tabs de Existencias PT): mismo lenguaje de activo suave (`bg-slate-100/90`) que el sidebar, sin nuevos estilos de “tab oscuro” salvo consenso de diseño.

---

## Checklist rápido (nueva pantalla)

- [ ] Contenido bajo `AppLayout`; sin segundo `max-w` salvo excepción justificada.
- [ ] Header con `pageHeaderRow` + `pageTitle` + `pageSubtitle` + acciones a la derecha.
- [ ] KPIs con `kpiCard` / `kpiCardSm` y labels/valores/footnotes de `page-ui`.
- [ ] Filtros en `filterPanel` con `filterSelectClass` / `filterInputClass`.
- [ ] Tablas en `tableShell` + filas `tableHeaderRow` / `tableBodyRow`.
- [ ] Vacíos y errores con tokens de estado, no strings sueltos con clases nuevas.

---

*Última referencia de código: `src/lib/page-ui.ts`.*

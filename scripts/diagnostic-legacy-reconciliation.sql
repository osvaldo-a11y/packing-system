-- =============================================================================
-- Diagnóstico solo lectura — trazabilidad legacy vs packing lists PT
-- (antes de POST /api/admin/reconcile-legacy-dispatches)
--
-- Uso: ejecutar en psql / cliente SQL. Solo contiene SELECT (sin escrituras).
--
-- Esquema real:
--   · despachos: tabla "dispatches" (sin packing_list_id; el vínculo es
--     "dispatch_pt_packing_lists").
--   · "LEGACY" en la API = despacho sin fila en dispatch_pt_packing_lists.
--   · packing list PT: "pt_packing_lists"; ítems: "pt_packing_list_items"
--     (final_pallet_id, NO pt_tag_id ni columna cajas en el ítem).
--   · Cajas del PL: suma de final_pallet_lines.amount por pallet en ítems.
--   · pt_tags: sin columna "estado"; el estado operativo del pallet está en
--     "final_pallets".status.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Despachos equivalentes a «LEGACY»: sin ningún vínculo en dispatch_pt_packing_lists
--    (no existe d.packing_list_id en el modelo).
-- ---------------------------------------------------------------------------
SELECT
  d.id,
  d.numero_bol AS bol,
  d.client_id,
  d.cliente_id,
  d.status AS estado_despacho,
  (
    SELECT COALESCE(SUM(fpl.amount), 0)::bigint
    FROM final_pallets fp
    INNER JOIN final_pallet_lines fpl ON fpl.final_pallet_id = fp.id
    WHERE fp.dispatch_id = d.id
  ) AS cajas_desde_lineas_pallet
FROM dispatches d
WHERE NOT EXISTS (
    SELECT 1
    FROM dispatch_pt_packing_lists dpl
    WHERE dpl.dispatch_id = d.id
  )
ORDER BY d.id;

-- ---------------------------------------------------------------------------
-- 2) Packing lists PT sin ítems (pt_packing_list_items vacío para ese pl.id)
--    La suma de cajas por ítem no existe en la tabla; aquí: 0 si no hay ítems,
--    o suma de líneas de pallet vinculados por ítem.
-- ---------------------------------------------------------------------------
SELECT
  pl.id,
  pl.list_code AS codigo,
  pl.numero_bol AS bol,
  pl.client_id,
  COUNT(pli.id) AS items_count,
  COALESCE(
    (
      SELECT SUM(sub.boxes)::bigint
      FROM (
        SELECT fp.id AS fp_id, COALESCE(SUM(fpl.amount), 0)::bigint AS boxes
        FROM pt_packing_list_items pli2
        INNER JOIN final_pallets fp ON fp.id = pli2.final_pallet_id
        LEFT JOIN final_pallet_lines fpl ON fpl.final_pallet_id = fp.id
        WHERE pli2.packing_list_id = pl.id
        GROUP BY fp.id
      ) sub
    ),
    0
  ) AS cajas_asignadas
FROM pt_packing_lists pl
LEFT JOIN pt_packing_list_items pli ON pli.packing_list_id = pl.id
GROUP BY pl.id, pl.list_code, pl.numero_bol, pl.client_id
HAVING COUNT(pli.id) = 0
ORDER BY pl.id;

-- ---------------------------------------------------------------------------
-- 3) Posibles matches despacho ↔ PL por BOL (+ alineación de cliente
--    como en la reconciliación: client_id del despacho o, si falta, cliente_id)
-- ---------------------------------------------------------------------------
SELECT
  d.id AS despacho_id,
  d.numero_bol AS despacho_bol,
  pl.id AS pl_id,
  pl.list_code AS pl_codigo,
  pl.numero_bol AS pl_bol,
  pl.client_id AS pl_client_id,
  COALESCE(NULLIF(d.client_id, 0), d.cliente_id) AS cliente_efectivo_dispatch
FROM dispatches d
INNER JOIN pt_packing_lists pl
  ON TRIM(BOTH FROM COALESCE(pl.numero_bol, '')) = TRIM(BOTH FROM COALESCE(d.numero_bol, ''))
 AND pl.client_id IS NOT DISTINCT FROM COALESCE(NULLIF(d.client_id, 0), d.cliente_id)
WHERE NOT EXISTS (
    SELECT 1 FROM dispatch_pt_packing_lists dpl WHERE dpl.dispatch_id = d.id
  )
  AND TRIM(BOTH FROM COALESCE(d.numero_bol, '')) <> ''
  AND pl.status <> 'anulado'
ORDER BY d.id, pl.id;

-- ---------------------------------------------------------------------------
-- 4) Trazabilidad legacy sin fila en pt_packing_list_items:
--    Tarjas (pt_tags) que aparecen en dispatch_tag_items en despachos «legacy»
--    y para las cuales ningún final_pallet asociado a esa tarja está en un
--    ítem de PL. (No hay pli.pt_tag_id; se cruza por final_pallets.tarja_id.)
-- ---------------------------------------------------------------------------
SELECT DISTINCT
  pt.id,
  pt.tag_code AS codigo,
  pt.total_cajas AS cajas_tarja,
  fp.id AS final_pallet_id,
  fp.status AS estado_pallet,
  d.id AS dispatch_id,
  d.numero_bol AS bol_despacho
FROM dispatch_tag_items dti
INNER JOIN dispatches d ON d.id = dti.dispatch_id
INNER JOIN pt_tags pt ON pt.id = dti.tarja_id
LEFT JOIN dispatch_pt_packing_lists dpl ON dpl.dispatch_id = d.id
INNER JOIN final_pallets fp ON fp.tarja_id = pt.id AND fp.dispatch_id = d.id
WHERE dpl.dispatch_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM pt_packing_list_items pli
    WHERE pli.final_pallet_id = fp.id
  )
ORDER BY d.id, pt.id, fp.id;

-- ---------------------------------------------------------------------------
-- (Opcional) Tarjas listadas en dispatch_tag_items de un despacho legacy pero
-- sin ningún final_pallets asociado (tarja_id + dispatch_id). Revisar carga.
-- ---------------------------------------------------------------------------
SELECT DISTINCT
  d.id AS dispatch_id,
  d.numero_bol,
  dti.tarja_id AS pt_tag_id,
  pt.tag_code,
  pt.total_cajas
FROM dispatch_tag_items dti
INNER JOIN dispatches d ON d.id = dti.dispatch_id
LEFT JOIN dispatch_pt_packing_lists dpl ON dpl.dispatch_id = d.id
INNER JOIN pt_tags pt ON pt.id = dti.tarja_id
WHERE dpl.dispatch_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM final_pallets fp
    WHERE fp.dispatch_id = d.id
      AND fp.tarja_id = dti.tarja_id
  )
ORDER BY d.id, dti.tarja_id;

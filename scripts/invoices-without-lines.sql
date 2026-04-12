-- Auditoría rápida: facturas (invoices) sin ningún detalle en invoice_items.
-- Si hay filas, la liquidación por productor no verá líneas para esos despachos.
-- API equivalente: GET /api/dispatches/invoice-health (JWT)
--
-- Regenerar desde la app (solo admin): POST /api/dispatches/invoice/regenerate-empty
--   Body: {}  → todos los despachos con factura vacía
--   Body: { "dispatch_ids": [1, 2] }  → solo esos despachos (si están en la lista)

SELECT
  i.id AS invoice_id,
  i.dispatch_id,
  i.invoice_number,
  i.subtotal,
  i.total,
  COUNT(ii.id)::int AS line_count
FROM invoices i
LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
GROUP BY i.id, i.dispatch_id, i.invoice_number, i.subtotal, i.total
HAVING COUNT(ii.id) = 0
ORDER BY i.id;

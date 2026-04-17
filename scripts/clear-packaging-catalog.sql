-- =============================================================================
-- Borra TODOS los materiales de empaque, recetas, líneas de receta y vínculos
-- material–proveedor. Deja intactos: categorías, formatos, clientes, marcas,
-- proveedores, especies, etc.
--
-- Antes de truncar materiales: limpia referencias opcionales (etiqueta en marca).
--
-- Ejecutar DESPUÉS de clear-dev-data.sql (o en la misma sesión) para evitar
-- FKs desde consumos/kardex hacia materiales.
--
-- Uso: npm run dev:clear-packaging
-- =============================================================================
BEGIN;

UPDATE brands SET label_material_id = NULL WHERE label_material_id IS NOT NULL;

TRUNCATE TABLE
  packaging_recipe_items,
  packaging_recipes,
  packing_material_suppliers,
  packaging_materials
RESTART IDENTITY CASCADE;

COMMIT;

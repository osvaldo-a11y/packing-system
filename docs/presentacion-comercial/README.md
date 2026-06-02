# Presentaciones comerciales v2

Generadas con capturas reales desde `screenshots-pinebloom/`.

## Archivos

| Archivo | Slides | Idioma |
|---------|--------|--------|
| `Pinebloom_Packing_System_EN_v2.pptx` | 11 | Inglés (comercial) |
| `Pinebloom_Packing_System_ES_v2.pptx` | 12 | Español (interno) |

## Regenerar

1. Asegurate de tener las capturas en `screenshots-pinebloom/` (`npm run screenshots:presentation`).
2. Ejecutá:

```bash
npm run presentations:v2
```

## Scripts

- `scripts/generate-presentations-v2.mjs` — genera ambos PPTX
- `scripts/lib/presentation-assets.mjs` — rutas de imágenes, marcos y layouts compartidos

Para cambiar posiciones de una imagen, editá las coordenadas `x/y/w/h` en el bloque del slide correspondiente dentro de `generate-presentations-v2.mjs`.

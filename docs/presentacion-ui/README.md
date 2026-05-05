# Capturas de pantalla (UI actual)

Las imágenes PNG se generan en la carpeta `screenshots/` con Playwright (vista completa de página, viewport 1440×900).

| Prefijo   | Contenido |
| --------- | --------- |
| `00`      | Login |
| `01`–`19` | Módulos principales (inicio, planta, empaque, PT, pedidos, reportes, etc.) |
| `20`–`22` | Detalles (existencia PT, packing list, avance de pedido) si hay datos en la API |

Incluye **Kardex empaque** (`06-kardex.png`).

## Regenerar

Con la API Nest en `http://127.0.0.1:3000` y Vite en `http://127.0.0.1:5173` (por ejemplo `npm run dev:full` desde la raíz del repo):

```bash
npm run screenshots:app
```

**Contraseña:** el script carga `.env` y, si no definís `SCREENSHOT_PASS`, intenta leer el campo `password` de `AUTH_USERS_JSON` para el usuario `admin` (o el de `SCREENSHOT_USER`). Si tu JSON solo tiene `passwordHash` y no `password`, definí siempre `SCREENSHOT_PASS` al ejecutar.

PowerShell (ejemplo con usuario explícito):

```powershell
$env:SCREENSHOT_USER="admin"; $env:SCREENSHOT_PASS="(tu contraseña)"; npm run screenshots:app
```

**Importante:** si el login por API funciona pero todas las capturas salían como “inicio”, el script ya **recarga la página** tras guardar el token para que React tome la sesión; además espera a que el **hash** de la URL coincida con cada módulo antes de disparar el PNG.

Otra carpeta de salida:

```bash
set SCREENSHOT_OUT=ruta\personalizada
npm run screenshots:app
```

En Windows PowerShell: `$env:SCREENSHOT_OUT="..."` antes del comando.

Las capturas de detalle (`20`–`22`) solo se generan si la API devuelve al menos un pallet, un packing list y un pedido.

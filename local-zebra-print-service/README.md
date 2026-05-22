# Local Zebra Print Service (Windows)

Servicio local para imprimir ZPL directo en impresora Zebra USB sin Browser Print.

## Endpoint

- `GET /printers`
- `GET /health`
- `GET /jobs` — últimos 20 trabajos (estado de la cola en memoria)
- `POST /print` — encola el trabajo (FIFO); la impresión física es **serial**
- Body JSON:

```json
{
  "filename": "tarja-123.zpl",
  "zpl": "^XA...^XZ",
  "printerName": "ZDesigner ZD230-203dpi ZPL",
  "jobName": "Tarja 123",
  "copies": 2
}
```

`printerName` es opcional. Si no se envía, usa la impresora predeterminada de Windows.
`copies` es opcional (1..99, default 1). Ajusta `^PQ` en el ZPL antes de enviar a la cola.
Si existen impresoras Zebra instaladas, el servicio prioriza Zebra (y 203dpi cuando aplica).

## Respuesta `POST /print`

- `202`: trabajo **aceptado en cola** (no espera a que termine la impresión física). Ejemplo:

```json
{
  "ok": true,
  "queued": true,
  "jobId": "uuid…",
  "status": "pending",
  "queuePending": 3
}
```

- `400`: body inválido (no encola)
- `4xx/5xx`: error raro del servidor

Cada job pasa por `pending` → `printing` → `done` o `error`. Un fallo **no bloquea** el siguiente en cola.

### `GET /jobs`

Lista los **últimos 20** jobs de la sesión (sin incluir el ZPL). Útil para diagnóstico en planta.

### `GET /jobs/:jobId`

Estado de un trabajo concreto (`pending` | `printing` | `done` | `error`). El frontend del sistema hace **polling** hasta `done`/`error` después de un `POST /print` con respuesta `202`.

### `/printers`

Devuelve lista instalada con metadatos:

```json
{
  "ok": true,
  "defaultPrinter": "ZDesigner ZT421-203dpi ZPL",
  "printers": [
    { "name": "ZDesigner ZT421-203dpi ZPL", "isDefault": true, "isZebra": true, "dpi": "203" }
  ]
}
```

## Ejecutar

```bash
npm install
npm start
```

Por defecto escucha en `http://127.0.0.1:3001`.
Podés cambiar puerto con `PRINT_SERVICE_PORT`.

### Desde la raíz del repo `packing-system` (sin `cd` manual)

En la carpeta del proyecto (un nivel **arriba** de `local-zebra-print-service`):

```bash
npm run print-service
```

Equivale a `node ./local-zebra-print-service/print-server.js`. Así no hace falta abrir PowerShell dentro de `local-zebra-print-service` cada vez.

Para **API + Vite + impresora** en una sola consola (Windows / Ctrl+C corta los tres):

```bash
npm run dev:full:print
```

### Frontend (Vite)

En el PC de planta, opcional: `frontend/.env.local`

```bash
VITE_ZPL_PRINT_SERVICE_URL=http://127.0.0.1:3001
```

## Inicio rapido en Windows

En el PC de planta podés usar:

`run-print-service.bat`

Ese script:
- instala dependencias si faltan
- inicia el servicio local de impresion

## Si la etiqueta sale con texto HTML en el papel

Eso significa que **a la impresora le llegó HTML** (página del sistema, login o `index.html`), no comandos ZPL que empiecen con `^XA`.

1. **No uses “Imprimir” del navegador (Ctrl+P)** sobre la pantalla del sistema: eso manda HTML/PDF del layout, no ZPL RAW. Usá el botón **Imprimir etiqueta PT** del modal (llama al API y luego a este servicio).
2. **Driver Zebra**: en Windows la cola debe ser un driver tipo **ZDesigner … ZPL** (o Zebra ZPL), no una impresora “genérica” que reinterpreta el job.
3. El servicio valida el cuerpo: si `POST /print` recibe HTML o texto que no empiece con `^XA`, responde **400** con mensaje claro y **no** manda nada a la Zebra.
4. Si guardaste un `.zpl` manualmente, abrilo con el bloc de notas: la primera línea útil debe ser `^XA`. Si ves `<!DOCTYPE html>`, el archivo no sirve para RAW.

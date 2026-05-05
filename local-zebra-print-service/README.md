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

# Demo comercial en vivo — Packing System (Pinebloom)

Entorno **aislado** para presentar el flujo operativo a cliente/jefatura (10–15 min).  
Misma app y familia visual Pinebloom. **No es un rediseño.** **No toca producción.**

## 1. Auditoría (cómo conviene montarla)

| Pieza | Estado actual |
|--------|----------------|
| App | Nest sirve API + `frontend/dist`. Login JWT. Usuario demo vía env (`DEMO_USERNAME`). |
| Flag sandbox | `DEMO_SANDBOX=true` → `GET /api/auth/health` incluye `demo_sandbox: true`; usuario demo **escribible**; `POST /api/demo/reset` habilitado. |
| Producción | **Sin** `DEMO_SANDBOX` (o `false`). El usuario `demo` queda **viewer**. Reset responde 403. |
| Seed | `npm run seed:demo` (HTTP). Gate: aborta si el API no es sandbox o si `API_BASE` es el host de producción. |
| Reset | `npm run demo:reset` = `POST /api/demo/reset` + re-seed. Conserva maestros; borra operación; en sandbox pone stock de materiales en 0 y vuelve a cargar kardex. |
| BD | Debe ser **otro Postgres** (`DB_NAME=packing_demo` en local, o plugin Postgres nuevo en Railway). |
| Railway | No hay Actions/preview automático en este repo. El preview de un PR **no** es un entorno demo. |
| Host de producción conocido | `packing-system-production.up.railway.app` — denylist en seed/reset. |

**Montaje recomendado:** servicio Railway (o PaaS) **aparte** + Postgres **nuevo** + `DEMO_SANDBOX=true` + seed.  
Este agente **no** puede crear el servicio Railway ni tocar el Postgres de producción (no hay token Railway; las puertas de seed lo impiden).

Local (verificado en este trabajo): Postgres `packing_demo` + API con `.env.demo`.

## 2. Riesgos: preview actual vs entorno separado

| Opción | Riesgo |
|--------|--------|
| Usar un preview de PR | Puede apuntar a la misma BD, no tener `DEMO_SANDBOX`, o mezclar UI a medias. Quien grabe en la reunión puede ensuciar datos reales. **No usar.** |
| Apuntar el seed a producción | **Prohibido.** Seed/reset abortan si `demo_sandbox` no es true o si el host está en denylist. |
| Servicio demo con `DATABASE_URL` de prod | Catástrofe. Checklist: el Postgres demo es **otra** instancia; `DEMO_SANDBOX` **nunca** en el servicio prod. |
| Entorno separado (recomendado) | Crear/editar en la reunión no afecta prod. Reset vuelve al dataset ficticio. |

## 3. Datos mínimos del seed (coherentes, no fixtures sueltos)

Hilo: **Blueberries Duke / Fundo Los Pinos → proceso → PT 12x18oz marca Pinebloom → Northstar Produce LLC**.

| Pieza | Contenido |
|--------|-----------|
| Maestros | Especie BB, productores Fundo Los Pinos / El Molino, Duke / Legacy, formato `12x18oz`, cliente Northstar, marca Pinebloom Farms, mercado USA |
| Recepciones | `REC-PB-4101` Duke 8000 lb (confirmada, saldo MP), `REC-PB-4102` Legacy 6000 lb, `REC-PB-4103` Duke borrador. Fechas = **hoy** del servidor para que el filtro Hoy no quede vacío. |
| Procesos | Duke 2700 lb (queda packout para crear PT), Legacy 2000 lb |
| PT + cámara | Pallet Duke 96 cajas **en depósito**; otros van a PL/despacho |
| Repaletizaje | Legacy 72+48 cajas → consolidado 64 cajas |
| Packing lists | Borrador (Duke 48), confirmado listo para despacho (repallet), confirmado ya despachado |
| Pedidos | `SO-DEMO-1001` abierto, `SO-DEMO-1002` del despacho ejemplo |
| Despacho | Ejemplo confirmado `BOL-DEMO-8801` |
| Materiales | Clamshell, cinta, etiqueta, pallet CHEP, esquinero + kardex (inicial / compra / salida) |

Catálogo legado de migraciones (`JAEMOR-FARMS`, `HIST-*`, `_MIG`) se **desactiva** (`activo: false`) vía API existente.

## 4. Módulos que se pueden demostrar end-to-end

Recepción → Proceso → Unidad PT → Stock/Cámara → Repaletizaje → Packing List (borrador/confirmado) → Pedido → Despacho.  
Materiales → Movimiento/kardex (dialog desktop y listado).

## 5. Dependencias / límites (no inventar flujos)

| Tema | Límite real |
|------|-------------|
| Confirmar proceso | Exige balance packout = entrada. El seed deja procesos en **borrador** para poder crear más PT en vivo. |
| Despacho | Requiere packing list **confirmado** + pedido del mismo cliente. |
| Kardex Mobile | El rediseño mobile de Movimiento/kardex **no** está en esta línea (Desktop sí). El listado de materiales mobile sí. |
| Impresión Zebra | Servicio local opcional; no hace falta para la demo comercial. |
| URL pública Railway | Hay que **crear** el servicio demo en Railway (checklist abajo). Este entorno de agente no publica un dominio de cliente. |

## 6. URL, credenciales y reset

### Local (aislado)

- App: `http://127.0.0.1:3000` (tras `npm start` con `.env` = `.env.demo`)
- Health: `GET http://127.0.0.1:3000/api/auth/health` → `"demo_sandbox": true`
- **Usuario cliente:** `admin.demo`  
- **Clave:** `demo123`  
- Operador interno seed/reset: `admin` / `admin123`

### Railway (URL para el cliente)

Instrucciones clic a clic y tabla de variables (copiar / nueva / no copiar): [RAILWAY-DEMO.md](./RAILWAY-DEMO.md).

Variables **solo** en el servicio demo (Postgres **nuevo**):

```
DEMO_SANDBOX=true
DEMO_USERNAME=admin.demo
DEMO_PASSWORD=demo123
DEMO_USER_ROLE=admin
JWT_SECRET=<distinto al de producción>
DATABASE_URL=<Postgres DEMO, no el de prod>
RUN_MIGRATIONS_ON_STARTUP=true
```

```bash
API_BASE=https://TU-DEMO.up.railway.app npm run seed:demo
```

**Producción:** no definir `DEMO_SANDBOX`. Comprobar:

```
GET https://packing-system-production.up.railway.app/api/auth/health
→ demo_sandbox: false
```

### Reset al dataset inicial

```bash
API_BASE=http://127.0.0.1:3000 npm run demo:reset
```

Equivalente: login admin → `POST /api/demo/reset` → `npm run seed:demo`.  
Si `DEMO_SANDBOX` no es true, el reset es **403**.

---

## Guion 10–15 min (clic a clic)

Viewport: Desktop **1440×900**. Login `admin.demo` / `demo123`. Idioma ES.

### Bloque A — Fruta → despacho (~12 min)

1. **Login** → Home Pinebloom. Mencionar chip de modo demo si aparece.
2. **Recepción** (nav Recepciones) → `#/receptions`. Abrir `REC-PB-4101` Fundo Los Pinos / Duke / 8000 lb. Señalar que parte ya fue a proceso y **sigue habiendo fruta disponible**. Mencionar `REC-PB-4103` en borrador (se puede completar en vivo si hay tiempo).
3. **Proceso** → `#/processes`. Abrir el proceso Duke (2700 lb desde 4101). Decir: “esta misma recepción alimenta el PT”.
4. **Producto terminado** → `#/pt-tags`. Mostrar unidades Duke 12x18oz marca Pinebloom / cliente Northstar. Si se anima: **Nueva unidad PT** usando el proceso Duke (packout residual).
5. **Stock / Cámara** → `#/existencias-pt/inventario`. Pallet Duke 96 cajas en depósito. Mismo lote/formato/cliente.
6. **Repaletizaje** → `#/existencias-pt/repaletizar`. Mostrar el consolidado Legacy (notas “Repaletizaje demo…”).
7. **Packing List** → `#/existencias-pt/packing-lists`.  
   - Uno **borrador** (Duke 48).  
   - Uno **confirmado** listo (`BOL-DEMO-8802`) — candidato a despacho en vivo.  
   - Uno ya usado en el despacho de ejemplo.
8. **Pedido** (menú más / Pedidos) → `#/sales-orders`. `SO-DEMO-1001` Northstar abierto; `SO-DEMO-1002` del ejemplo.
9. **Despacho** → `#/dispatches`. Abrir el despacho `BOL-DEMO-8801` (confirmado).  
   Opcional en vivo: **Nuevo despacho** con el PL confirmado `BOL-DEMO-8802` + pedido `SO-DEMO-1001`.

### Bloque B — Materiales / Kardex (~2–3 min)

10. **Materiales** → `#/packaging/materials`. Filas: Clamshell 18 oz Pinebloom, Cinta stretch, Etiqueta, Pallet CHEP, Esquinero. Stock no vacío.
11. Desktop: abrir **Movimiento / kardex** del clamshell. Mostrar inicial + compra + salida. No hace falta grabar; si se graba, `npm run demo:reset` restaura.

Mobile **390×844** (mismos hashes): Home, Recepciones, Procesos, PT, Cámara, Packing lists, Despachos, Materiales. Kardex como **dialog desktop**; en mobile usar el listado de materiales.

---

## Arranque local (operador)

```bash
# Postgres: crear BD packing_demo (no packing_system de otros usos)
createdb packing_demo   # o equivalente psql

cp .env.demo .env
npm install
npm run build
npm start

# otra terminal
API_BASE=http://127.0.0.1:3000 npm run seed:demo
```

Gates: seed aborta sin `demo_sandbox=true`; reset aborta igual; host `packing-system-production.up.railway.app` bloqueado.

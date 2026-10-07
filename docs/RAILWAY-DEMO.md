# Publicar `packing-system-demo` en Railway (servicio nuevo)

**No reutilizar el servicio ni el Postgres de producción.**  
**No duplicar el servicio de prod** (Railway copia variables, incluido `DATABASE_URL` y `JWT_SECRET`).  
Crear un **proyecto nuevo** (o servicios nuevos vacíos) llamados `packing-system-demo`.

Branch a desplegar hasta mergear PR #32: `cursor/demo-comercial-sandbox-4f41`.  
Host de producción conocido (no tocar): `packing-system-production.up.railway.app`.

---

## Variables exactas del servicio app `packing-system-demo`

| Variable | Valor | Copiar de la app actual | Nueva | NO copiar de prod |
|----------|--------|-------------------------|-------|-------------------|
| `DATABASE_URL` | **Reference** al Postgres **demo** (plugin nuevo) | No | **Sí** (referencia al PG demo) | **Nunca** la URL de prod |
| `JWT_SECRET` | Aleatorio, p. ej. `openssl rand -hex 32` | No | **Sí** | **Nunca** el de prod |
| `DEMO_SANDBOX` | `true` | No | **Sí** (solo demo) | **Nunca** ponerla en prod |
| `DEMO_USERNAME` | `admin.demo` | No | **Sí** | — |
| `DEMO_PASSWORD` | `demo123` | No | **Sí** (clave de presentación) | No uses claves reales de planta |
| `DEMO_USER_ROLE` | `admin` | No | **Sí** | — |
| `DEMO_USER_ENABLED` | `true` | Opcional (default true) | Preferible setear | — |
| `DEMO_SHOW_CREDENTIALS` | `true` | No | **Sí** (login muestra “Probar”) | — |
| `NODE_ENV` | `production` | Solo el **nombre** del valor, escríbelo a mano | **Sí** | No copies el bloque de vars de prod |
| `RUN_MIGRATIONS_ON_STARTUP` | `true` | Igual criterio | **Sí** | — |
| `JWT_EXPIRES_IN` | `8h` | Valor no secreto; puedes escribir `8h` | **Sí** | — |
| `COMPANY_DISPLAY_NAME` | `Pinebloom Farms` | **Sí** (marca, no secreto) | — | — |
| `AUTH_USERS_JSON` | JSON **nuevo** de abajo | No | **Sí** | **Nunca** el JSON/hashes de prod |
| `PORT` | Lo inyecta Railway | No | No definir | — |

`AUTH_USERS_JSON` recomendado (una línea, **no** el de producción):

```json
[{"username":"admin","password":"admin123","role":"admin"}]
```

El usuario de la reunión (`admin.demo`) lo crea el servidor con `DEMO_USERNAME` / `DEMO_PASSWORD`. No hace falta meterlo en el JSON.

### No definir en el demo (y nunca copiar de prod)

| Variable | Por qué |
|----------|---------|
| `RAILWAY_URL` | Apunta al Postgres de prod en scripts locales |
| `DB_HOST` `DB_USER` `DB_PASS` `DB_NAME` | En Railway basta `DATABASE_URL` del **PG demo** |
| `PRINT_AGENT_API_KEY` | Secreto de planta / impresora |
| `ZEBRA_PRINTER_NAME` `VITE_ZEBRA_PRINTER_NAME` `VITE_ZPL_PRINT_SERVICE_URL` | Impresora local, no aplica |
| `VITE_API_URL` | Si apunta al API de prod, el front demo escribiría en prod. Dejar **vacío** (mismo origen `/api`) |
| `DEMO_SEED_ALLOW_NON_SANDBOX` | Peligroso; no existe en el servidor, no la pongas |

---

## Clic a clic — proyecto y Postgres nuevos

1. Entrá a [https://railway.app](https://railway.app) con la cuenta que ya tiene el repo.
2. **New Project** (proyecto **distinto** al de producción). Nombre sugerido: `packing-system-demo`.
3. **Deploy from GitHub repo** → `osvaldo-a11y/packing-system`.
4. En el servicio que aparece: **Settings → Source** → branch **`cursor/demo-comercial-sandbox-4f41`** (no `main` hasta mergear #32).
5. **Settings** del servicio: renombralo a **`packing-system-demo`**. Root Directory vacío.
6. **Settings → Build**: `npm install && npm run build`. **Start**: `npm start`.
7. En el **mismo** proyecto demo: **+ New → Database → PostgreSQL**. Esperá **Running**. Renombrá el plugin a **`packing-system-demo-db`**.
8. Servicio **`packing-system-demo`** (la app, no el PG) → **Variables**:
   - **Add Reference** → Postgres **demo** → `DATABASE_URL`. Confirmá que el servicio fuente es `packing-system-demo-db`, **no** el Postgres de prod.
   - Añadí a mano el resto de la tabla (nunca “Import from production” / “Duplicate service”).
9. **Settings → Networking → Generate Domain**. Anotá `https://….up.railway.app`.
10. Esperá deploy **Success**. Logs: migraciones al arranque (`RUN_MIGRATIONS_ON_STARTUP=true`).
11. Comprobá **antes** del seed:

```bash
curl -sS https://TU-DEMO.up.railway.app/api/auth/health
# debe ser: "demo_sandbox": true

curl -sS https://packing-system-production.up.railway.app/api/auth/health
# debe seguir: "demo_sandbox": false  (o sin el flag true)
```

### Seed (URL pública)

Desde tu máquina, en el clone del repo (branch del PR #32):

```bash
API_BASE=https://TU-DEMO.up.railway.app \
DEMO_SEED_USER=admin.demo \
DEMO_SEED_PASS=demo123 \
npm run seed:demo
```

Si también cargaste `AUTH_USERS_JSON` con `admin`/`admin123`, vale:

```bash
API_BASE=https://TU-DEMO.up.railway.app npm run seed:demo
```

El seed **aborta** si `demo_sandbox` no es true o si `API_BASE` es el host de producción.

### Reset entre reuniones

```bash
API_BASE=https://TU-DEMO.up.railway.app \
DEMO_SEED_USER=admin.demo \
DEMO_SEED_PASS=demo123 \
npm run demo:reset
```

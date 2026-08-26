# Entorno demo escribible (sandbox de ventas)

Objetivo: que un **externo** entre, cargue datos y pruebe el flujo **sin tocar producción**.

## Arquitectura

| Entorno | URL | Base de datos | Usuario `demo` |
|---------|-----|---------------|----------------|
| **Producción** | app real | Postgres producción | Solo lectura (`viewer`) o desactivado |
| **Sandbox** | URL aparte (p. ej. `…-demo.up.railway.app`) | **Otro** Postgres | Escribible (`admin` por defecto) |

Misma imagen/código (`main`). La diferencia es solo variables de entorno.

## Variables del servicio sandbox (Railway)

```bash
DEMO_SANDBOX=true
DEMO_USER_ENABLED=true
DEMO_USER_ROLE=admin
DEMO_USERNAME=demo
DEMO_PASSWORD=demo123
DEMO_SHOW_CREDENTIALS=true
JWT_SECRET=<secreto distinto al de producción>
DATABASE_URL=<URL del Postgres DEMO, no el de producción>
NODE_ENV=production
RUN_MIGRATIONS_ON_STARTUP=true
```

Opcional: `AUTH_USERS_JSON` con `admin` / `demo` (si no, los defaults + `ensureDemoUser` alcanzan).

**Producción:** no definir `DEMO_SANDBOX` (o `false`). El usuario `demo` queda en **viewer**.

## Alta en Railway (checklist)

1. En el mismo proyecto (o uno nuevo): **New → Database → PostgreSQL** (instancia **nueva**).
2. **New → Empty Service** (o duplicar el de prod) → conectar el mismo repo `main`.
3. Build/Start iguales a producción (`npm run build` / `npm start`).
4. Variables: las de arriba + **Reference** a `DATABASE_URL` del Postgres **demo**.
5. Generate Domain (anotá la URL).
6. Tras el primer deploy: migraciones (si no corren al start) y seed:

```bash
API_BASE=https://TU-DEMO.up.railway.app npm run seed:demo
```

Credenciales seed admin por defecto: `admin` / `admin123` (o las de `AUTH_USERS_JSON` del sandbox).

## Credenciales para el prospecto

- **Usuario:** `demo`
- **Clave:** `demo123` (o `DEMO_PASSWORD`)
- En el login verá “Prueba el sistema” y podrá crear/editar.

## Reset entre demos

```bash
API_BASE=https://TU-DEMO.up.railway.app npm run demo:reset
```

También: `POST /api/demo/reset` con JWT **admin** (solo si `DEMO_SANDBOX=true`).

## Verificación rápida

```http
GET https://TU-DEMO/api/auth/health
→ { "status":"ok", "demo_sandbox": true }

GET https://TU-DEMO/api/auth/demo-info
→ { "sandbox": true, "writable": true, "username":"demo", ... }
```

Producción debe responder `demo_sandbox: false` y `writable: false` en demo-info.

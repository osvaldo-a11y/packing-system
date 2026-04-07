# Despliegue del backend `packing-system`

Sustituye `[nombre-del-servidor/servicio]` por tu destino real (por ejemplo **VPS Ubuntu**, **Railway**, **Render**, **Azure App Service**, **AWS ECS**, **Google Cloud Run**, **Fly.io**).

## Requisitos comunes

- Node.js 20+ (o imagen Docker oficial `node:20-alpine`).
- PostgreSQL 14+ accesible desde la API.
- Variables de entorno: ver `.env.example` (especialmente `JWT_SECRET`, `DB_*`, `AUTH_USERS_JSON` o tu proveedor de identidad futuro).

## Flujo recomendado

1. **Build**: `npm ci && npm run build`
2. **Migraciones**: `npm run migration:run` (con `DB_*` apuntando al Postgres de ese entorno)
3. **Arranque**: `node dist/main.js` o `npm run start:prod` (añade el script si lo deseas)

## Opción A: VPS (systemd + Nginx)

1. Clonar el repo en el servidor, instalar Node y Postgres (o usar Postgres gestionado).
2. Crear `.env` en el servidor (no commitear secretos).
3. Usuario systemd `packing-api.service` con `WorkingDirectory`, `ExecStart=/usr/bin/node dist/main.js`, `EnvironmentFile=/etc/packing-system.env`.
4. **Nginx** como reverse proxy a `127.0.0.1:3000`, TLS con Let’s Encrypt.
5. Firewall: solo 80/443 públicos; Postgres no expuesto a internet si es local.

## Opción B: Docker / Docker Compose

- Construir imagen con `Dockerfile` multi-stage: etapa `builder` (`npm ci && npm run build`), etapa final solo `node` + `dist` + `node_modules` de producción.
- `docker compose` con servicios `app` y `postgres`, red interna, volumen para datos de Postgres.
- Pasar `JWT_SECRET` y `DB_*` por variables del compose o archivo `env` no versionado.

## Opción C: PaaS (Railway, Render, Fly.io, etc.)

1. Conectar el repositorio o subir la imagen Docker.
2. Definir variables de entorno en el panel del proveedor.
3. Comando de inicio: `node dist/main.js` o el que configure el build.
4. Ejecutar migraciones como **release command** o job previo al despliegue (según la plataforma).

## HTTPS y CORS

- En producción, sirve la API solo detrás de HTTPS.
- Si el front está en otro dominio, configura CORS en Nest (`app.enableCors({ origin: [...] })`) cuando lo integres.

## Siguiente nivel de seguridad

- Sustituir `AUTH_USERS_JSON` por usuarios en base de datos con contraseñas **bcrypt**.
- O integrar **OAuth2/OIDC** (Azure AD, Google Workspace, Keycloak) y mapear grupos a `admin` / `supervisor` / `operator`.

---

Cuando indiques el **nombre concreto** del servidor o servicio (por ejemplo “Railway” o “un VPS en Contabo”), se pueden detallar los clics o los archivos exactos para ese entorno.

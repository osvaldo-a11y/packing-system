# Packing System Backend

Backend NestJS integrado para:
- Modulo 2: Proceso de fruta y generacion de tarjas de producto terminado.
- Modulo 3: Despacho, packing list y facturacion.

## Ejecutar

1. Levantar Postgres con Docker:
   - `docker compose up -d`
2. Crear archivo de entorno:
   - copiar `.env.example` a `.env`
3. Instalar dependencias:
   - `npm install`
4. Ejecutar migraciones:
   - `npm run migration:run`
5. Levantar API:
   - `npm run start:dev`

Produccion: `npm run build` y `npm start` (tras definir variables de entorno). Migraciones en servidor: `NODE_ENV=production npm run migration:run:prod`.

## Arranque rapido (2 comandos)

1. `docker compose up -d`
2. `npm install && npm run migration:run && npm run start:dev`

## Scripts utiles

- `npm run dev:up`: levanta Postgres y corre migraciones.
- `npm run dev:down`: baja contenedores.
- `npm run dev:reset-db`: reinicia Postgres desde cero y vuelve a migrar.
- `npm start`: arranca `node dist/main.js` (tras `npm run build`).

## Makefile (opcional)

- `make up`
- `make down`
- `make reset-db`
- `make start`
- `make test-e2e`

## Autenticacion JWT

1. **Login** (sin token):
   - `POST /api/auth/login` con cuerpo `{ "username": "...", "password": "..." }`
   - Respuesta: `{ access_token, token_type, expires_in }`
2. Enviar en las rutas protegidas:
   - Cabecera `Authorization: Bearer <access_token>`
3. El **rol** (`admin`, `supervisor`, `operator`) va dentro del JWT (claim `role`), no en cabeceras personalizadas.

Usuarios por defecto (solo desarrollo): ver `AUTH_USERS_JSON` en `.env.example`.

Endpoints publicos: `POST /api/auth/login`, `GET /api/auth/health`, `GET /api/plant-settings` (lectura).

## Pruebas e2e

- `npm run test:e2e`
- El test valida flujo con JWT: login, token en rutas protegidas, roles y reportes.

## Produccion: reportes, exportacion y seguridad

### Parametros de planta (umbrales)

- `GET /api/plant-settings` — lectura sin token.
- `PUT /api/plant-settings` — JWT con rol **admin** (`Authorization: Bearer ...`).

### Reportes con paginacion

- `GET /api/reporting/generate?page=1&limit=20` — requiere JWT (cualquier rol: admin, supervisor, operator).
- Cada seccion devuelve `{ rows, total, page, limit }`.
- Incluye `plant_thresholds` y `alertas` por fila en merma/rendimiento cuando se superan umbrales.

### Exportacion

- `GET /api/reporting/export?format=csv|xlsx|pdf` — requiere JWT (cualquier rol).

### Roles (dentro del JWT)

| Rol | Uso |
| --- | --- |
| `admin` | Edicion de parametros planta, borrado de reportes guardados |
| `supervisor` | Edicion de tarjas, pedidos, crear/editar reportes guardados |
| `operator` | Lectura de reportes, listados y export |

Operaciones protegidas (JWT + rol):

- `PUT /api/pt-tags/:id` — admin o supervisor.
- `PUT /api/sales-orders/:id` — admin o supervisor.
- `POST` / `PUT /api/reporting/saved-reports` — admin o supervisor.
- `DELETE /api/reporting/saved-reports/:id` — admin.

En produccion: usar `JWT_SECRET` fuerte y sustituir usuarios en JSON por base de datos u OAuth2/OIDC.

## Despliegue

- **Solo Railway** (orden de clics): [docs/RAILWAY.md](docs/RAILWAY.md).
- **Otros PaaS** (Render, Heroku, etc.): [docs/PAAS-DEPLOY.md](docs/PAAS-DEPLOY.md).
- Otros entornos: [docs/DEPLOY.md](docs/DEPLOY.md).

# Despliegue rápido en PaaS (Railway, Render, Heroku)

Este backend es una app **Node.js + NestJS** que escucha en `process.env.PORT` y usa **PostgreSQL**. El flujo típico es:

1. Conectar **repositorio Git** (GitHub/GitLab/Bitbucket).
2. Añadir **base de datos Postgres** en el mismo panel o como add-on.
3. Definir **variables de entorno** (URL de DB, `JWT_SECRET`, etc.).
4. **Build**: `npm install` + `npm run build`.
5. **Arranque**: `npm start` (equivale a `node dist/main.js`).
6. **Migraciones**: ejecutarlas **una vez** por entorno antes o justo después del primer despliegue (según la plataforma).

---

## Variables que debes configurar en el PaaS

Copia desde `.env.example` y adapta:

| Variable | Descripción |
|----------|-------------|
| `PORT` | Suele **inyectarla el propio PaaS** (no hace falta fijarla a mano salvo que el panel lo pida). |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` | Credenciales del Postgres que te da el servicio (a veces llegan como **URL**; ver abajo). |
| `JWT_SECRET` | Cadena larga y aleatoria (obligatorio en producción). |
| `JWT_EXPIRES_IN` | Ej.: `8h`. |
| `AUTH_USERS_JSON` | Usuarios de login en JSON (solo para pruebas; en serio usa BD u OAuth). |

### Variable `DATABASE_URL`

El proyecto ya soporta **`DATABASE_URL`**: si está definida (típico en Railway, Render y Heroku), **TypeORM usa esa URL** y no hace falta rellenar `DB_HOST`, `DB_PORT`, etc. por separado.

- **SSL**: por defecto se usa `ssl: { rejectUnauthorized: false }` (habitual en Postgres gestionado). Si tu proveedor no usa SSL, define `DB_SSL_DISABLED=true`.

### Migraciones en producción

Tras `npm run build`, ejecuta migraciones con:

```bash
NODE_ENV=production npm run migration:run:prod
```

En **Heroku**, el `Procfile` incluye `release: npm run migration:run:prod` (Heroku suele tener `NODE_ENV=production` en release).

En **Railway/Render**, ejecuta ese comando una vez en la **shell** del servicio o como paso de deploy, según prefieras.

---

## Railway (https://railway.app)

1. Crea cuenta y **New Project** → **Deploy from GitHub** (u otro Git).
2. Selecciona el repo que contiene `packing-system`.
3. Añade **PostgreSQL**: **New** → **Database** → **PostgreSQL**. Railway inyecta variables; revisa el nombre (a veces `PGHOST`, `PGUSER`, etc.). Mapea a `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` según lo que exponga el plugin, o usa **Variable Reference** en el servicio de la app.
4. En el servicio **web** (tu API), pestaña **Variables**:
   - `JWT_SECRET` = valor seguro.
   - `AUTH_USERS_JSON` = (opcional) el JSON de usuarios de prueba.
5. **Settings** del servicio web:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
6. **Migraciones** (elige una):
   - **Opción A**: Tras el primer deploy, abre **Shell** en el servicio y ejecuta: `npm run migration:run`
   - **Opción B**: Añade un paso en **Deploy** → **Custom Start Command** poco recomendado si ejecuta migraciones en cada arranque sin control; mejor un job manual o un comando único post-deploy.
7. **Generate Domain** para obtener URL pública y probar `GET /api/auth/health`.

---

## Render (https://render.com)

1. **New** → **Web Service** → conecta el repositorio.
2. Configuración típica:
   - **Runtime**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
3. Crea **New** → **PostgreSQL** y anota host, usuario, contraseña y base. Pásalos a las variables `DB_*` del Web Service.
4. En **Environment**, añade `JWT_SECRET`, `AUTH_USERS_JSON`, etc.
5. **Opcional**: en **Advanced** → **Pre-Deploy Command**: `npm run migration:run` (ejecuta migraciones antes de cada deploy; útil si quieres automatizar).
6. Despliega y prueba la URL que te asigna Render + `/api/auth/health`.

---

## Heroku (https://heroku.com)

> Requiere tarjeta para apps con add-ons gratuitos limitados; sigue siendo válido si ya usas Heroku.

1. Instala **Heroku CLI** y haz login: `heroku login`
2. En la carpeta del proyecto: `heroku create nombre-app`
3. Añade Postgres: `heroku addons:create heroku-postgresql:mini` (o plan que corresponda).
4. Heroku inyecta `DATABASE_URL`. Tu app usa `DB_*` separadas: en el **dashboard** → **Settings** → **Config Vars**, crea `DB_HOST`, `DB_USER`, etc. extrayendo de `DATABASE_URL`, o adapta el código para leer `DATABASE_URL` (recomendado a medio plazo).
5. Configura también `JWT_SECRET` y demás variables.
6. El repo incluye **`Procfile`**:
   - `release: npm run migration:run` — corre migraciones en cada release.
   - `web: npm start` — arranca la API.
7. Despliega: `git push heroku main` (o la rama que uses).
8. Abre `https://nombre-app.herokuapp.com/api/auth/health`.

---

## Comprobar que todo va bien

```http
GET https://TU-DOMINIO/api/auth/health
```

Respuesta esperada: `{ "status": "ok", "service": "packing-system" }`

Login:

```http
POST https://TU-DOMINIO/api/auth/login
Content-Type: application/json

{"username":"admin","password":"admin123"}
```

(Usuarios según `AUTH_USERS_JSON` en producción.)

---

## Resumen de elección rápida

| Plataforma | Ventaja típica |
|------------|----------------|
| **Railway** | Muy rápido para conectar Git + Postgres; buena DX. |
| **Render** | Generoso en capa gratuita (con límites); Postgres integrado. |
| **Heroku** | Flujo clásico `git push`; `Procfile` con `release` encaja bien con migraciones. |

Si me dices cuál de los tres vas a usar **primero**, puedo ayudarte a afinar solo ese flujo (nombres exactos de pantallas o variables según cambios recientes del proveedor).

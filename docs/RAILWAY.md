# Despliegue solo en Railway (paso a paso)

> Los nombres de botones pueden cambiar ligeramente si Railway actualiza la interfaz; la secuencia lógica se mantiene.

## Antes de empezar

1. Código del backend en un repositorio **GitHub** (o GitLab/Bitbucket si Railway lo tiene conectado).
2. Sesión iniciada en [railway.app](https://railway.app) con la misma cuenta que tiene acceso al repo.

---

## Parte A — Crear el proyecto y conectar el repo

1. Entra en **https://railway.app** e inicia sesión.
2. En el **dashboard**, pulsa **New Project** (o **+ New** → **Project**).
3. Elige **Deploy from GitHub repo** (o **Empty Project** y luego conectar Git; lo más directo es **Deploy from GitHub repo**).
4. Si te pide permisos, **autoriza a Railway** a acceder a tus repositorios y selecciona el repo donde está `packing-system`.
5. Railway detectará el repo y creará un **servicio** (aparece como caja/card con el nombre del repo o “web”).  
   - Si te pregunta **Root Directory** y tu `package.json` está en la raíz del repo, déjalo **vacío** o `/`.  
   - Si el backend está en una subcarpeta, indica esa carpeta (ej. `packing-system/`).

---

## Parte B — Base de datos PostgreSQL

6. En el mismo **proyecto** (vista con el diagrama o lista de servicios), pulsa **+ New** (o **Create**).
7. Elige **Database** → **Add PostgreSQL** (o **PostgreSQL**).
8. Espera a que el plugin **PostgreSQL** quede en estado **Running** / verde.

Railway suele crear variables como `PGHOST`, `PGUSER`, `DATABASE_URL`, etc., en el servicio de Postgres. Para esta API lo más simple es usar **`DATABASE_URL`**.

---

## Parte C — Variables en el servicio de la API (tu app Node)

9. Haz **clic en el servicio de tu aplicación** (el que despliega el repo), **no** en el servicio Postgres.
10. Abre la pestaña **Variables** (o **Settings** → **Variables** según el layout).
11. Pulsa **+ New Variable** (o **Add Variable**) y añade **una por una**:

| Nombre | Valor (ejemplo) |
|--------|------------------|
| `DATABASE_URL` | Pulsa **Add Reference** → elige el servicio **Postgres** → variable **`DATABASE_URL`** (o la que Railway muestre como URL completa de conexión). Así la app usa la misma URL que inyecta Postgres. |
| `JWT_SECRET` | Una cadena larga y aleatoria (no la compartas). |
| `NODE_ENV` | `production` |
| `AUTH_USERS_JSON` | (Opcional, solo pruebas) Copia el JSON de `.env.example` o acorta usuarios. |

12. Si al referenciar Postgres **no** aparece `DATABASE_URL` en el plugin, en el servicio **Postgres** abre **Variables** / **Connect** y copia la **Connection URL**; luego en el servicio de la app crea `DATABASE_URL` manualmente pegando esa URL.

13. (Opcional) Si el Postgres de Railway **no** usa SSL y ves errores de conexión, añade `DB_SSL_DISABLED` = `true`. En la mayoría de los casos **no** hace falta.

---

## Parte D — Build y arranque

14. En el servicio de la app, abre **Settings** (engranaje o pestaña **Settings**).
15. Busca **Build** / **Build Command** y pon:  
    `npm install && npm run build`
16. Busca **Deploy** / **Start Command** y pon:  
    `npm start`
17. Guarda si hay botón **Save** / **Update**.

---

## Parte E — Dominio y despliegue

18. En el servicio de la app, pestaña **Settings** → sección **Networking** / **Public Networking**.
19. Pulsa **Generate Domain** (o **Add custom domain** si ya tienes dominio). Anota la URL pública (ej. `https://tu-app.up.railway.app`).
20. Railway redeployará solo; si no, en **Deployments** pulsa **Redeploy** en el último deploy.

---

## Parte F — Migraciones (una vez por entorno)

21. Con el deploy **exitoso**, abre el servicio de la app → **Deployments** → en el último deploy busca **View logs** o el menú **⋯** → **Open Shell** / **Shell** (si está disponible).
22. En la shell del contenedor ejecuta:

```bash
NODE_ENV=production npm run migration:run:prod
```

23. Si no hay shell, usa **Railway CLI** instalada en tu PC, enlaza el proyecto y ejecuta el mismo comando en el servicio (documentación Railway: *CLI*).

---

## Parte G — Comprobar que funciona

24. En el navegador:  
    `https://TU-DOMINIO-RAILWAY/api/auth/health`  
    Deberías ver JSON con `"status":"ok"`.
25. Login de prueba (si usaste `AUTH_USERS_JSON` por defecto):

```http
POST https://TU-DOMINIO-RAILWAY/api/auth/login
Content-Type: application/json

{"username":"admin","password":"admin123"}
```

---

## Orden resumido (checklist)

1. New Project → Deploy from GitHub → elegir repo.  
2. + New → PostgreSQL.  
3. Servicio **app** → Variables → `DATABASE_URL` (referencia a Postgres) + `JWT_SECRET` + `NODE_ENV=production`.  
4. Settings → Build: `npm install && npm run build` → Start: `npm start`.  
5. Settings → Generate Domain.  
6. Shell → `NODE_ENV=production npm run migration:run:prod`.  
7. Probar `/api/auth/health` y `/api/auth/login`.

---

## Si algo falla

- **Build falla**: revisa que el **root directory** apunte donde está `package.json`.
- **App cae al arrancar**: revisa **logs** del servicio app; suele ser DB o `JWT_SECRET`.
- **Error SSL con Postgres**: prueba sin tocar primero; si hace falta, `DB_SSL_DISABLED=true`.

Cuando Railway cambie nombres de menús, busca equivalentes: *Variables*, *Settings*, *Database*, *Deployments*, *Networking*.

# Despliegue del backend en Railway

> Despliegue de **demostración**: la pasarela de pago, la emisión de pólizas y
> los mensajes de retención son simulados a propósito. La base es el proyecto
> Supabase de producción (`wboemfsclwpzxsmodzct`), que ya tiene todas las
> migraciones aplicadas.

## 1. Antes de desplegar

- Las migraciones van **antes** que la app (arquitectura backend §7). Para comprobar que no queda ninguna
  pendiente, desde `svas-backend`: `npx supabase db push --remote --dry-run --include-all` → "Remote database is up to date".
- `main` en verde: `npm test` y `npm run test:e2e`.

## 2. Crear el servicio (una sola vez, en el panel de Railway)

1. **New Project → Deploy from GitHub repo** → elegir el repositorio `SVAS`, rama `main`.
2. En el servicio, **Settings**:

   | Opción | Valor |
   |---|---|
   | Root Directory | `svas-backend` |
   | Builder | Railpack (el predeterminado) |
   | Build Command | `npm run build` |
   | Start Command | `npm run start:prod` (sin esto Railpack usaría `npm start` = `nest start`, que recompila) |
   | Healthcheck Path | `/api/v1/health/ready` |
   | Replicas | **1** (ver §5) |
   | Restart Policy | On Failure |

   La configuración va en el panel y no en un `railway.json`: Railway marcó ese archivo como obsoleto
   (deja de leerse el 2026-12-01) y además, con Root Directory, no lo encuentra solo.
3. **Settings → Networking → Generate Domain** para obtener la URL pública (`https://<algo>.up.railway.app`).

La versión de Node sale de `engines.node` en `package.json` (24.x).

## 3. Variables (Settings → Variables)

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | la del proyecto (mismo valor que en el `.env` local) |
| `SUPABASE_ANON_KEY` | ídem |
| `SUPABASE_SERVICE_ROLE_KEY` | ídem (secreta: solo aquí y en el `.env`, nunca en el repo) |
| `SUPABASE_JWKS_URL` | ídem |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | `https://svas-frontend.onrender.com` (el frontend publicado en Render, sin barra final). Para trabajar en local con el backend local: `http://localhost:5173` |

No definir `PORT`: Railway la inyecta y la app escucha en ella. Si falta o es inválida una variable, la app no arranca
y el log del deploy dice cuál (validación con zod).

## 4. Prueba después de cada despliegue (Bruno)

1. En `bruno/environments/Railway.bru`, cambiar `CAMBIAR` por el dominio generado (solo la primera vez).
2. Elegir el entorno **Railway** en Bruno y correr:
   - `02 Salud` → Live y Ready en 200 (`database: up`, `auth: up`).
   - `05 Catalogo publico/Campos del formulario` → 5 aseguradoras.
   - `06 Cotizaciones/Cotizar Corolla 2022` → el caso dorado (Toyota Corolla 2022, ubigeo 150122) con las 10 primas
     de la tabla §17.6 del doc de dominio.

Con eso el despliegue está bien. El resto de carpetas se puede correr igual que en local.

## 5. Cosas a tener en cuenta

- **Una sola instancia.** Los jobs (`detector-abandono` cada hora, `caducidad-seguimiento` a las 8:00 de Lima,
  `regenerar-pdf-pendiente` cada 5 min) y el rate limiting viven en memoria. Con dos réplicas los jobs correrían
  dos veces y el límite por IP se repartiría.
- **Los jobs solo corren con el servicio encendido.** No activar "App Sleeping" / serverless en Railway.
- **CORS** acepta un único origen (`FRONTEND_URL`), hoy el frontend de Render; desde `http://localhost:5173` el navegador no puede
  llamar a Railway. Bruno no se ve afectado (CORS lo aplica el navegador). Guía del frontend: `despliegue-frontend.md`.
- **Mensajes de retención**: con `NODE_ENV=production` el log oculta el token del enlace de retoma (es simulado).
- **Supabase Auth**: la arquitectura pide activar la confirmación de correo en producción
  (Authentication → Providers → Email → Confirm email).
- Cada push a `main` vuelve a desplegar. Si una migración nueva rompe compatibilidad, aplicarla antes del push
  (o dividirla en dos despliegues).

# Despliegue del frontend en Render

> El frontend (repo `SVAS-frontend`) es un sitio **estático** publicado en Render:
> **https://svas-frontend.onrender.com**. Habla con el backend de Railway
> (`https://svas-production.up.railway.app/api/v1`, ver `despliegue.md`) y con Supabase (solo la sesión).
> Publicado y probado a mano (portada, iniciar sesión, cotizar) el 2026-11-12.

## 1. Cómo está armado

La configuración vive en el repo del frontend, en **`render.yaml`** (Blueprint):

| Pieza | Valor |
|---|---|
| Tipo | Sitio estático (`runtime: static`), no se duerme |
| Build | `npm ci && npm run build` (corre `tsc -b` y `vite build`) |
| Publica | `./dist` |
| Node | `NODE_VERSION=24` (Vite 8 pide 20.19+ o 22.12+; `package.json` → `engines: 24.x`) |
| Rutas | rewrite `/*` → `/index.html` (SPA: React Router resuelve en el navegador) |
| Cabeceras | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy` |
| Caché | `/assets/*` por un año (`immutable`; el nombre lleva el hash) |

El CSP es el mismo del `vercel.json` (que queda en el repo como alternativa): `script-src 'self'` (el build solo tiene un
script externo, sin código en línea), `connect-src` solo a `'self'`, a la API de Railway y a `*.supabase.co`, y
`frame-ancestors 'none'`. **Si cambia el dominio del backend, hay que cambiarlo en `connect-src`** dentro de `render.yaml`.

## 2. Variables

Todas son `VITE_*` y se leen al **construir**, no al abrir la página: si se cambian, hay que volver a desplegar
(Manual Deploy). Ninguna es secreta; la service role key y el JWT secret **nunca** van en el frontend.

| Variable | Valor | Dónde se define |
|---|---|---|
| `NODE_VERSION` | `24` | `render.yaml` |
| `VITE_API_URL` | `https://svas-production.up.railway.app/api/v1` | `render.yaml` |
| `VITE_SUPABASE_URL` | la del proyecto de Supabase (la misma del `.env` local) | panel de Render (`sync: false`) |
| `VITE_SUPABASE_ANON_KEY` | la anon key (pública por diseño) | panel de Render (`sync: false`) |

## 3. Crear el sitio (una sola vez)

1. Render → **New → Blueprint** → repo `SVAS-frontend`, rama `main`, ruta `render.yaml`. Poner un nombre al Blueprint.
2. Render pide `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`: copiarlas del `svas-frontend/.env` local.
3. Aplicar. Render crea el sitio `svas-frontend`, lo construye y da la URL pública.

Desde entonces, **cada push a `main` de `SVAS-frontend` vuelve a desplegar** el sitio solo. Un push a `SVAS` (backend y docs) no lo toca.
Los cambios futuros de `render.yaml` se sincronizan solos con el Blueprint (puede cambiar costos si se agregan servicios).

## 4. Conectarlo con el backend (CORS)

El backend acepta **un único origen** (`FRONTEND_URL`, `main.ts` → `enableCors`). En Railway, servicio del backend →
Variables: `FRONTEND_URL = https://svas-frontend.onrender.com` (sin barra final). Esa misma variable arma los enlaces de
retoma y de compra que reciben los clientes (`aviso-cliente.service.ts`), así que ahora apuntan al sitio de Render.

Consecuencias:

- Desde cualquier otro origen, incluido `http://localhost:5173`, el navegador bloquea las llamadas al backend de Railway.
  **`npm run dev` ya no funciona contra Railway.** Para desarrollar en local hay que levantar el backend local
  (`FRONTEND_URL=http://localhost:5173` en su `.env`) o, si se quiere usar Railway, cambiar el backend para aceptar una
  lista de orígenes separados por comas (no hecho; redespliega Railway).
- Bruno y `curl` no se ven afectados: CORS lo aplica el navegador.

## 5. Comprobar un despliegue

Sin navegador (solo lectura):

```powershell
$u = "https://svas-frontend.onrender.com"
curl.exe -s -D - -o NUL "$u/"                 # 200 y las cabeceras de seguridad (content-security-policy…)
curl.exe -s -o NUL -w "%{http_code}`n" "$u/app/reportes/ventas"   # 200: la ruta profunda cae en index.html
# CORS del backend desde esta origen: debe responder access-control-allow-origin con la URL de Render
curl.exe -s -D - -o NUL -X OPTIONS -H "Origin: $u" -H "Access-Control-Request-Method: GET" "https://svas-production.up.railway.app/api/v1/catalogo/campos"
```

En el navegador: la portada con estilos, cotizar un vehículo (tres pasos y comparativo), iniciar sesión con un cliente y con el
administrador, abrir `/app` y recargar estando en una ruta interna (debe seguir ahí). La primera llamada al backend puede
tardar si Railway estuvo inactivo: sale el aviso "despertando el servidor".

## 6. Si algo falla

| Síntoma | Causa probable |
|---|---|
| Portada en blanco o sin estilos | El build falló o `staticPublishPath` no es `./dist`; mirar el log del despliegue en Render |
| Build rojo en Render | Falta una variable `VITE_*` o la versión de Node; el log lo dice |
| Toda llamada al backend falla en el navegador (consola: "blocked by CORS policy") | `FRONTEND_URL` en Railway no es exactamente la URL de Render (sin barra final), o Railway aún no terminó de redesplegar |
| Iniciar sesión falla pero la API responde | `VITE_SUPABASE_URL` o la anon key mal copiadas: corregir en Render y hacer **Manual Deploy** |
| Una ruta interna da 404 al recargar | Falta el rewrite `/*` → `/index.html` (está en `render.yaml`) |
| Recursos bloqueados en la consola ("violates Content Security Policy") | El CSP de `render.yaml` no permite ese dominio (backend nuevo, fuentes, imágenes externas) |

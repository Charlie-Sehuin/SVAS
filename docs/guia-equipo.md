# Guía para el equipo — cómo trabajar en el backend de SVAS

> Para quien se suma al proyecto: cómo levantar el backend en tu máquina, cómo
> está organizado, cómo agregar un módulo o un endpoint nuevo, cómo crear una
> migración y cómo llega todo a producción.
>
> Lee también, en este orden:
> 1. `contexto-dominio-seguro-simple.md`: el negocio, las reglas (RN-xx), los requisitos (RF-xx). **Manda en caso de conflicto.**
> 2. `arquitectura-backend-seguro-simple.md`: el diseño técnico y el orden de construcción (§10).
> 3. `estado-implementacion.md`: qué está hecho, qué falta y las decisiones tomadas.
> 4. `despliegue.md`: cómo está desplegado en Railway.

---

## 0. Lo mínimo que tienes que saber antes de tocar nada

- **Hay una sola base de datos y es la de producción** (Supabase, proyecto `wboemfsclwpzxsmodzct`).
  No hay una base "de desarrollo". Lo que hagas desde Bruno o desde tu backend local **escribe en producción**.
- **Todo lo que llega a `main` se despliega solo** en Railway (`https://svas-production.up.railway.app`).
  Si rompes `main`, rompes la API para todos.
- **Nunca se sube un secreto a git.** Ya se filtró una contraseña una vez a través de un archivo de ejemplo
  y hubo que reescribir el historial. Las reglas están en §7.
- La pasarela de pago, la emisión de pólizas y los mensajes (WhatsApp/correo) son **simulados a propósito**.
  No hace falta (ni se quiere) integrar servicios reales.

---

## 1. Accesos que necesitas

Pídeselos al responsable del repo:

| Acceso | Para qué | ¿Todos? |
|---|---|---|
| GitHub (colaborador del repo `SVAS`) | clonar, crear ramas, abrir PR | Sí |
| Las 4 variables de Supabase (ver §2.2) | correr el backend en local | Sí |
| Miembro de la organización de Supabase | crear/probar/aplicar migraciones con el CLI | Solo quien toque la base |
| Miembro del proyecto en Railway | ver logs y variables de producción | Solo 1 o 2 personas |

Las claves se pasan **por mensaje privado**, nunca en un grupo, un documento compartido, un issue ni un commit.

---

## 2. Levantar el backend en tu máquina

### 2.1 Requisitos

- **Node.js 24** (el `package.json` exige `24.x`; es lo que usa Railway). Comprueba con `node -v`.
- **Git**.
- **Bruno** (cliente de API, gratis): https://www.usebruno.com — ahí están todas las pruebas manuales.
- El CLI de Supabase **no se instala**: se usa con `npx supabase ...`.

### 2.2 Pasos

```bash
git clone https://github.com/Charlie-Sehuin/SVAS.git
cd SVAS/svas-backend
npm ci                      # instala exactamente lo del package-lock.json
cp .env.example .env        # en Windows PowerShell: Copy-Item .env.example .env
```

Llena `svas-backend/.env` con los valores que te pasaron:

| Variable | Obligatoria | Qué es |
|---|---|---|
| `SUPABASE_URL` | Sí | URL del proyecto Supabase |
| `SUPABASE_ANON_KEY` | Sí | Clave pública (la usa el cliente "como usuario", con RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | **Clave maestra**: salta RLS. Es la más delicada de todas |
| `SUPABASE_JWKS_URL` | Sí | URL de las llaves públicas para verificar los JWT |
| `PORT` | No (3000) | Puerto local |
| `NODE_ENV` | No (`development`) | En local déjalo en `development` (así el log muestra los enlaces de retoma) |
| `FRONTEND_URL` | No (`http://localhost:5173`) | Único origen permitido por CORS |
| `FEATURE_CLASIFICADOR_LLM` | No (`false`) | Clasificador de preocupaciones con LLM (pospuesto) |
| `ANTHROPIC_API_KEY` | Solo si el flag anterior es `true` | — |

Si falta o está mal una variable, la app **no arranca** y te dice cuál (validación con zod en
`src/config/env.validation.ts`). Para revisar sin arrancar: `npm run verificar-env`.

```bash
npm run start:dev     # arranca con recarga automática en http://localhost:3000/api/v1
```

Comprueba: `http://localhost:3000/api/v1/health/ready` debe responder
`{"status":"ok","checks":{"database":"up","auth":"up"}}`.

### 2.3 Bruno

1. En Bruno: **Open Collection** → carpeta `svas-backend/bruno`.
2. Copia `bruno/.env.example` como `bruno/.env` y llénalo (las instrucciones están dentro del archivo).
   `bruno/.env` está en `.gitignore`; **el `.env.example` se sube y debe quedar siempre sin valores**.
3. Arriba a la derecha elige el entorno: **Local** (tu máquina) o **Railway** (producción).
4. Las carpetas están numeradas en el orden en que se construyó el sistema. Muchas solicitudes dependen
   de variables que guarda una solicitud anterior (por ejemplo, `08/10` necesita haber corrido `08/02`).
   Si Bruno dice *"variables that could not be resolved"*, corre antes las solicitudes previas de esa carpeta
   o usa **Run** sobre la carpeta entera.

Usuarios: el administrador se crea con `npm run crear-admin -- --email X --nombre "Y"`; el asesor lo crea
el admin con `07/01 Crear asesor`; el cliente se registra con `07/02`.

### 2.4 Comandos útiles

| Comando | Qué hace |
|---|---|
| `npm run start:dev` | Backend local con recarga |
| `npm test` | Pruebas unitarias (rápidas, no tocan la base) |
| `npm run test:e2e` | Pruebas e2e (levantan la app y **leen** de Supabase; no escriben) |
| `npm run lint` | oxlint |
| `npm run format` | prettier sobre `src/` y `test/` |
| `npm run build` | Compila a `dist/` (lo mismo que hace Railway) |
| `npx tsc --noEmit -p tsconfig.json` | Solo revisa tipos |

---

## 3. Cómo está organizado el código

```
svas-backend/
├── src/
│   ├── main.ts                 # prefijo /api/v1, Helmet, CORS, trust proxy
│   ├── app.module.ts           # registra todos los módulos, guards globales, throttler, schedule
│   ├── config/                 # validación de variables de entorno (zod)
│   ├── common/                 # lo transversal (ver 3.2)
│   ├── infrastructure/
│   │   ├── database/           # clientes de Supabase y llamarRpc()
│   │   └── observability/      # /health/live y /health/ready
│   ├── integracion/            # adaptadores de lo "externo": estrategias de las 5 aseguradoras,
│   │                           # pasarela simulada, emisión simulada, PDF, notificador, clasificador
│   ├── shared/types/enums.ts   # enums compartidos (espejo de los enums de Postgres)
│   └── modules/                # un módulo por área del negocio
│       ├── seguridad/  administracion/  cotizacion/  planes/
│       ├── asesoria-retencion/  prueba-choque/
│       ├── pagos/  polizas/  compra/
│       └── reportes/
├── supabase/migrations/        # 0001 … 0037, SQL numerado
├── test/app.e2e-spec.ts        # e2e
├── bruno/                      # colección de pruebas manuales, una carpeta por módulo
└── scripts/                    # crear-admin, cambiar-password, verificar-env, seed de tarifas
```

### 3.1 Capas dentro de cada módulo

Cada módulo sigue la misma forma (arquitectura hexagonal, "puertos y adaptadores").
El más simple para copiar es `modules/reportes/`:

```
modules/reportes/
├── domain/                         # reglas puras: SIN NestJS, SIN Supabase
│   ├── reportes.ts                 # tipos y funciones del negocio
│   └── reportes.repository.port.ts # interfaz (puerto) + Symbol para inyectarla
├── application/
│   └── reportes.service.ts         # casos de uso: orquesta dominio + puertos
├── infrastructure/
│   └── reportes-supabase.repository.ts  # implementa el puerto llamando RPC de Postgres
├── presentation/
│   ├── reportes.controller.ts      # rutas HTTP, @Roles, @AccessToken
│   └── dto/reportes.dto.ts         # validación de entrada (class-validator, mensajes en español)
├── reportes.module.ts              # une todo: { provide: REPORTES_REPOSITORY, useClass: ... }
└── reportes.spec.ts                # pruebas unitarias del módulo
```

Reglas de dependencia:
- `domain/` no importa nada de NestJS, Supabase ni de otras capas. Se prueba sin mocks.
- `application/` depende del dominio y de **interfaces** (puertos), nunca de la implementación concreta.
- `infrastructure/` y `presentation/` son las únicas que conocen Supabase y HTTP.
- Lo externo (aseguradoras, pago, PDF, mensajes) entra **siempre por un puerto**; el adaptador vive en `src/integracion/`.

### 3.2 Lo que ya tienes hecho en `common/` (úsalo, no lo reinventes)

| Pieza | Para qué |
|---|---|
| `@Public()` | La ruta no pide login |
| `@Roles('ADMINISTRADOR' \| 'ASESOR' \| 'CLIENTE')` | Exige rol. Sin `@Public()`, toda ruta exige JWT válido |
| `@AccessToken()` | Te da el JWT del usuario para llamar RPC "como él" |
| `@CurrentUser()` | `{ id, email, roles }` del usuario |
| `@AuthOpcional()` | Ruta pública que, si viene JWT, lo usa |
| `SupabaseAuthGuard`, `RolesGuard` | Globales; verifican firma del JWT y que el usuario siga activo |
| `HttpExceptionFilter` + `postgrest-error.filter.ts` | Traducen errores de Postgres a HTTP (tabla 4.4) |
| `SanitizeResponseInterceptor`, `mask.util` | Enmascaran datos sensibles en respuestas y logs |
| `money.util` (`aDinero`, `redondear`) | Dinero con `decimal.js` |
| `correlation-id.middleware` | Cada respuesta trae `X-Correlation-Id` para rastrear errores |

### 3.3 Dos clientes de Supabase, y cuándo usar cada uno

| Cliente | Cómo se obtiene | Corre como | Úsalo para |
|---|---|---|---|
| **De usuario** | `SupabaseUserClientFactory.paraToken(token)` | El usuario (`auth.uid()`, RLS aplica) | **Por defecto, todo lo que pide un usuario**, incluidas las acciones del admin |
| **De servicio** | inyectar `SUPABASE_SERVICE_CLIENT` | `service_role` (salta RLS) | Solo jobs programados, health checks, carga de tarifas y lo que el backend hace "por su cuenta" |

Si dudas, es el de usuario. Usar el de servicio para una acción de un usuario es un agujero de seguridad.

---

## 4. Convenciones (por qué el código se ve como se ve)

### 4.1 Idioma y nombres
- Código, mensajes de error, commits y documentos **en español** (sin tildes en nombres de variables y archivos).
- Archivos en `kebab-case`: `generar-resumen-retencion.use-case.ts`, `pasarela-simulada.adapter.ts`.
- Cuando una regla viene del documento de dominio, cita su código en un comentario: `// RN-35`, `(RF-26)`.

### 4.2 Dinero
- En Postgres: `numeric(12,2)`. En TypeScript: `Decimal` (con `aDinero` / `redondear`). En JSON: **string** (`"614.78"`).
- **Nunca `number` para montos.** `0.1 + 0.2 !== 0.3` y aquí se cobran primas.

### 4.3 Dónde va cada regla
- **Reglas que dependen de la petición** (validar, calcular, decidir): en `domain/`, como funciones puras con pruebas.
- **Lo que tiene que ser atómico o lo protege la base** (crear una orden y sus cuotas juntas, que un descuento no
  pase el tope, permisos): en una **función RPC de Postgres** (`security definer`), dentro de una migración.

### 4.4 Errores
Los RPC lanzan errores con un código; el backend los traduce solo:

| En SQL | HTTP | Mensaje que ve el usuario |
|---|---|---|
| `raise exception 'texto'` (P0001) | 400 | el texto (escríbelo para el usuario final, en español) |
| `using errcode = 'P0002'` | 404 | el texto |
| `using errcode = 'PT409'` | 409 | el texto |
| `using errcode = '42501'` / `exigir_rol()` | 403 | mensaje genérico |
| violación de `unique` (23505) | 409 | mensaje genérico |
| `check`, FK, uuid mal formado | 400 | "Los datos enviados no son válidos" |
| cualquier otro | 500 | mensaje genérico (nunca se muestra SQL ni nombres de tablas) |

En TypeScript lanza las excepciones de NestJS (`BadRequestException('…')`, `NotFoundException`, …) con mensaje en español.

### 4.5 Validación de entrada
DTOs con `class-validator` y **mensajes en español** (mira `compra/presentation/dto/compra.dto.ts`). El pipe global
rechaza campos que no estén en el DTO (`whitelist` + `forbidNonWhitelisted`).

### 4.6 Respuestas
camelCase, fechas ISO, montos como string. Nunca devuelvas columnas internas ni el desglose de cálculo al cliente
(RN-41).

---

## 5. Receta: agregar un módulo nuevo

Ejemplo: un módulo `siniestros` (inventado). El orden es el mismo que se usó en todo el proyecto
(arquitectura §10.4).

### Paso 1 — Rama

```bash
git checkout main
git pull
git checkout -b feat/siniestros
```

Ramas: `feat/<modulo>` para funciones, `fix/<tema>` para arreglos, `chore/<tema>` para configuración,
`docs/<tema>` para documentación.

### Paso 2 — Lee y anota

Busca en `contexto-dominio-seguro-simple.md` las RN/RF que aplican y en `arquitectura-backend-seguro-simple.md`
lo que se haya planeado. Si tomas una decisión que no está escrita, anótala en `estado-implementacion.md`
("Decisiones propias … revisables").

### Paso 3 — Migración (si necesitas tablas o RPC)

Ver §6. Se prueba con `begin … rollback` **antes** de seguir.

### Paso 4 — Dominio + pruebas

```
src/modules/siniestros/domain/
├── siniestro.ts                     # tipos y funciones puras
└── siniestros.repository.port.ts    # interfaz + export const SINIESTROS_REPOSITORY = Symbol('SINIESTROS_REPOSITORY')
```

Escribe las pruebas en `siniestros.spec.ts` (mira `reportes.spec.ts` o `pagos.spec.ts`): el dominio se prueba con
datos directos; los servicios, con un repositorio falso que implementa el puerto.

### Paso 5 — Infraestructura

`infrastructure/siniestros-supabase.repository.ts` implementa el puerto. Para llamar un RPC:

```ts
return llamarRpc<MiTipo>(this.usuarios.paraToken(token), 'nombre_del_rpc', { p_param: valor });
```

`llamarRpc` ya convierte el error de Postgres en la excepción que el filtro traduce a HTTP.

### Paso 6 — Aplicación

`application/siniestros.service.ts` (o un `*.use-case.ts` por caso de uso si son varios). Inyecta el puerto:

```ts
constructor(@Inject(SINIESTROS_REPOSITORY) private readonly repo: SiniestrosRepository) {}
```

### Paso 7 — Presentación

`presentation/siniestros.controller.ts` con `@Roles(...)` (o `@Public()`) y `presentation/dto/` para la entrada.
La ruta final queda bajo `/api/v1/...`. Rutas de admin: `admin/...`; de asesor: `asesor/...`.

### Paso 8 — Módulo y registro

```ts
@Module({
  imports: [IntegracionModule],          // solo si usas un adaptador de integracion/
  controllers: [SiniestrosController],
  providers: [
    { provide: SINIESTROS_REPOSITORY, useClass: SiniestrosSupabaseRepository },
    SiniestrosService,
  ],
})
export class SiniestrosModule {}
```

Y agrégalo a `imports` en `src/app.module.ts`.

### Paso 9 — Pruebas

- `npm test` y `npm run test:e2e` en verde. En `test/app.e2e-spec.ts` agrega al menos: la ruta sin token da 401
  y, si aplica, con el rol equivocado da 403.
- **Bruno:** crea una carpeta nueva numerada (`14 Siniestros/`) con el camino feliz y los errores. Mira cualquier
  `.bru` existente: `script:pre-request` para encadenar, `tests { }` para afirmar el resultado, `docs { }` para
  explicar qué prueba. **Nunca escribas una clave o contraseña en un `.bru`**: usa `{{variable}}` o
  `{{process.env.X}}`.

### Paso 10 — Documentar

En `estado-implementacion.md`: fila en la tabla de §1, lo que existe en §3, decisiones tomadas.

### Paso 11 — Commit y Pull Request

Ver §7. Abre el PR hacia `main` y pide que otra persona lo revise antes de mezclar.

### Si solo agregas un endpoint a un módulo existente

Mismo camino en pequeño: (migración si hace falta) → dominio + prueba → método en el repositorio y el servicio →
ruta en el controller + DTO → e2e/Bruno → PR.

### Si agregas un adaptador externo (por ejemplo, otra aseguradora)

- Aseguradora: nueva clase en `src/integracion/estrategias/` que extiende `EstrategiaBase` y se registra en
  `estrategia.registry.ts` (mira cualquiera de las 5 existentes y `estrategias.spec.ts`). Sus tarifas van por
  migración/seed.
- Cualquier otro servicio externo: interfaz en el `domain/` del módulo que lo usa, implementación en
  `src/integracion/<tema>/`, y se exporta desde `integracion.module.ts`.

---

## 6. Migraciones (cambios en la base)

### 6.1 Reglas
- Una migración aplicada **no se edita nunca**. Si hay que corregir, se crea otra nueva (así se hizo con 0032).
- Numeración correlativa: la siguiente es **`0038_`**. **Avisa al grupo el número que vas a usar** antes de crearla,
  para que dos personas no tomen el mismo.
- Nombre: `NNNN_descripcion_corta.sql` en `svas-backend/supabase/migrations/`.
- Todo vive en el esquema `svas`.

### 6.2 Cómo se escribe (copia el estilo de `0037_rn35_mensaje_final.sql`)
- Encabezado en comentario: qué hace, de qué secciones/RN sale, qué errores lanza y qué decisiones propias toma.
- Tablas nuevas: **con RLS activado** y sin grants a `anon`.
- Funciones RPC:
  ```sql
  create or replace function svas.mi_funcion(p_x uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = svas, public
  as $$
  begin
    perform svas.exigir_rol(array['ADMINISTRADOR']);   -- o array['ASESOR'], array['CLIENTE'], …
    ...
    raise exception 'Mensaje para el usuario' using errcode = 'P0002';
  end;
  $$;

  revoke all on function svas.mi_funcion(uuid) from public, anon;
  grant execute on function svas.mi_funcion(uuid) to authenticated;   -- o service_role
  ```
- Las acciones que cambian datos dejan rastro en `svas.registro_actividad`.

### 6.3 Probarla sin dejar cambios (obligatorio antes de aplicarla)
Arma un archivo que envuelva la migración y tus casos de prueba en una transacción que se deshace:

```sql
begin;
-- (pega aquí el contenido de la migración)
-- casos: llama a las funciones, verifica resultados, errores esperados y permisos
rollback;
```

y córrelo (desde `svas-backend/`, con acceso a Supabase y avisando al grupo, porque es producción):

```bash
npx supabase login                                     # una vez
npx supabase link --project-ref wboemfsclwpzxsmodzct   # una vez
npx supabase@3.1.0 db query --remote --yes -f prueba-00NN.sql
```

Un truco usado en todo el proyecto: acumular los resultados en una variable y terminar con
`raise exception '%', resultados;` para verlos todos de una vez (la transacción se deshace igual).
Anota en `estado-implementacion.md` cuántos casos probaste.

### 6.4 Aplicarla
**La aplica una sola persona**, coordinada con el grupo, y **antes** de mezclar el código que la usa
(la app desplegada no puede llamar a una función que todavía no existe):

```bash
npx supabase db push --remote --dry-run --include-all   # ver qué se va a aplicar
npx supabase db push --remote --include-all             # aplicar
npx supabase db push --remote --dry-run --include-all   # debe decir "Remote database is up to date"
```

Si la migración rompe algo que la versión desplegada usa (renombra una columna, cambia la firma de una función),
divídela en dos: primero lo nuevo conviviendo con lo viejo, después de desplegar el código, quitar lo viejo.

---

## 7. Git: commits, secretos y Pull Requests

### 7.1 Antes de cada commit
1. `npm test` (y `npm run test:e2e` si tocaste rutas) en verde.
2. Agrega **archivo por archivo**, nunca una carpeta entera ni `git add .`:
   ```bash
   git add -- src/modules/siniestros/domain/siniestro.ts src/modules/siniestros/siniestros.module.ts ...
   ```
3. Revisa **todo** lo que vas a subir: `git diff --cached`.
4. Busca secretos en lo que vas a subir:
   ```bash
   git diff --cached | grep -inE "password|secret|api[_-]?key|service_role|eyJ[a-zA-Z0-9]{20,}"
   ```
   Si aparece un valor real (no solo el nombre de una variable), **no hagas el commit**.

### 7.2 Qué nunca se sube
- `svas-backend/.env` y `svas-backend/bruno/.env` (ya están en `.gitignore`; no lo quites).
- Valores dentro de `.env.example` o `bruno/.env.example`: deben quedar **vacíos**.
- Tokens copiados de una respuesta de Bruno, contraseñas en un `.bru`, capturas con claves en `docs/`.

**Si se te escapa un secreto**: avisa enseguida. Hay que **rotar la clave** en Supabase (borrar el commit no basta;
GitHub ya lo guardó) y luego limpiar el historial.

### 7.3 Mensajes de commit
Formato `tipo(módulo): qué hace`, en español:
```
feat(siniestros): registrar siniestro y listar los míos
fix(compra): el resumen no mostraba el descuento
docs: guía para el equipo
chore(deploy): ...
```

### 7.4 Pull Request
1. `git push -u origin feat/siniestros`
2. Abre el PR hacia `main` en GitHub. En la descripción: qué hace, qué RN/RF cubre, qué migración usa
   (y si ya está aplicada), cómo probarlo en Bruno.
3. Otra persona lo revisa. Se mezcla con **merge commit** (no squash), como el resto del historial.
4. Al mezclar, Railway despliega solo. Revisa que el deploy quede **Active** y corre `02 Salud` en el entorno Railway.

---

## 8. Despliegue (Railway)

Detalle completo en `despliegue.md`. Lo esencial:

- Se despliega **solo** al mezclar a `main`. Nadie despliega a mano.
- Configuración (en el panel de Railway, no en archivos): Root Directory `svas-backend`, build `npm run build`,
  start `npm run start:prod`, health check `/api/v1/health/ready`, **1 réplica**, sin "Serverless".
- Variables en Railway:

  | Variable | Valor |
  |---|---|
  | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWKS_URL` | las de Supabase |
  | `NODE_ENV` | `production` |
  | `FRONTEND_URL` | el dominio del frontend (hoy `http://localhost:5173`) |
  | `PORT` | **no se define**: la pone Railway |

- **Si agregas una variable de entorno nueva**: añádela a `src/config/env.validation.ts`, a `.env.example`
  (sin valor), a la tabla de §2.2 de esta guía y **a Railway antes de mezclar** (si es obligatoria y falta, el deploy
  no arranca).
- Una sola instancia, porque los jobs programados (`@Cron`) y el rate limiting viven en memoria. Si agregas un job,
  ten presente que corre en esa única instancia.
- Plan actual: prueba gratuita de Railway (vence alrededor del 2026-12-12). Ver `estado-implementacion.md`.

---

## 9. Checklist rápido para tu PR

- [ ] Rama `feat/…` / `fix/…` creada desde `main` actualizado
- [ ] Reglas de negocio en `domain/`, sin NestJS ni Supabase
- [ ] Dinero con `Decimal`, string en JSON
- [ ] Ruta con `@Roles` o `@Public` a propósito; DTO con mensajes en español
- [ ] Llamadas de usuario con el cliente de usuario (no el de servicio)
- [ ] Migración nueva (si hay): número avisado, RLS, grants, probada con `begin … rollback`, aplicada antes del merge
- [ ] `npm test` y `npm run test:e2e` en verde; `npx tsc --noEmit` limpio
- [ ] Carpeta de Bruno con camino feliz y errores, sin valores secretos
- [ ] `estado-implementacion.md` actualizado
- [ ] `git add` archivo por archivo, `git diff --cached` revisado, sin secretos
- [ ] Variables nuevas (si hay) en `env.validation.ts`, `.env.example` y Railway

---

## 10. Dónde pedir ayuda

- ¿Qué debe hacer el sistema? → `contexto-dominio-seguro-simple.md` (busca la RN/RF).
- ¿Cómo está pensado técnicamente? → `arquitectura-backend-seguro-simple.md`.
- ¿Por qué se hizo así? → "Decisiones propias" en `estado-implementacion.md`.
- ¿Cómo se ve un ejemplo real? → `modules/reportes/` (simple), `modules/compra/` (completo, con varios puertos).
- Un error en producción → el `X-Correlation-Id` de la respuesta te permite encontrarlo en los logs de Railway.

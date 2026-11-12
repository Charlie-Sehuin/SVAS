# Arquitectura Backend + Instructivo de Construcción — Documento Unificado
## Stack: TypeScript + NestJS + Supabase (Auth + Postgres + Storage + RLS)
## Dominio: SeguroSimple — Sistema de Venta Autónoma de Seguros (SVAS)

> **Qué es este documento**: el **cómo** (patrones, capas, seguridad,
> convenciones) y el **orden** (en qué secuencia se construye) del backend.
> Se sube junto con `contexto-dominio-seguro-simple.md` (el **qué**),
> `arquitectura-frontend-seguro-simple.md` y
> `contexto-frontend-backend-conexion-seguro-simple.md` al mismo Proyecto de
> Claude.
>
> **Jerarquía de fuentes de verdad**: ante cualquier conflicto,
> `contexto-dominio-seguro-simple.md` manda — define tablas, columnas,
> reglas, RPCs, roles y migraciones. Este documento no introduce entidades
> ni reglas nuevas; si algo aquí parece contradecirlo, es un error de este
> documento.

---

## Índice

1. Visión general y principios de diseño
2. Estructura completa de carpetas
3. Explicación detallada de cada carpeta y módulo
4. Decisiones de diseño clave
5. Cómo se resuelven los objetivos no negociables
6. Flujo completo de una request (ejemplo: confirmar compra)
7. Orden de despliegue (pipeline CI/CD)
8. Convenciones de código y checklist por módulo
9. Migraciones — tabla unificada
10. Instructivo de construcción: configuración inicial y orden por olas
11. Siguientes pasos recomendados

---

## 1. Visión general y principios de diseño

- **Hexagonal + DDD**: cada módulo (`seguridad`, `administracion`,
  `cotizacion`, `prueba-choque`, `compra`, `pagos`, `polizas`,
  `asesoria-retencion`, `reportes`) tiene `domain/` sin dependencias de
  NestJS ni de Supabase. Lo externo entra por **puertos**: las 5
  aseguradoras (`EstrategiaCotizacion`), la pasarela (`PasarelaPago`), la
  emisión (`EmisionAseguradora`), el PDF (`GeneradorPdf`), los mensajes
  (`NotificadorMensajes`) y el clasificador opcional
  (`ClasificadorPreocupaciones`). Esto es lo que permite cumplir RNF-15:
  reemplazar lo simulado por lo real sin tocar el flujo de venta.
- **Reglas en el dominio, atomicidad en Postgres**: las reglas que dependen
  de la petición (derivación, nicho, unión de campos, cálculo de la Prueba
  de Choque) son funciones/entidades TypeScript puras y testeables. Las que
  deben resistir concurrencia (intentos de contacto, toma de casos, doble
  cobro, descuento único) viven en RPCs `SECURITY DEFINER` y disparadores.
- **Zero Trust**: toda request pasa por validación de esquema, JWT, rol y
  rate limit. Los flujos públicos (cotizar sin cuenta) no son "sin
  seguridad": usan un **token de cotización** opaco y throttling más
  estricto.
- **Patrón Strategy** (exigido por la Práctica 1, OE1): una clase por
  aseguradora, registradas en un `EstrategiaRegistry` indexado por
  `aseguradora.codigo_estrategia`. Cada clase es una **función pura**: recibe
  el vehículo y la **tarifa de esa aseguradora ya cargada en memoria**
  (`TarifaAseguradora`: tasa base, pesos y rangos de suma) y devuelve las
  primas de sus planes. Los **datos** viven en las tablas de tarifa (D7 del doc
  de dominio); la **fórmula**, en la clase (RN-40). Agregar una aseguradora =
  datos en sus tablas + una clase + fila en el catálogo (principio
  abierto/cerrado, RNF-13). Explicación y ejemplos numéricos: doc de dominio,
  sección 17.
- **Sin estado en memoria del proceso**: throttling, idempotencia y locks de
  jobs viven en Postgres (o Redis cuando se escale). El plan gratuito corre
  una instancia, pero el diseño no lo asume.

```
┌──────────────────────────────────────────────────────────────┐
│  SPA React (Vercel) — cliente móvil · asesor · administrador   │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTPS · Authorization: Bearer <JWT>
                           │         X-Cotizacion-Token (flujo anónimo)
┌──────────────────────────▼───────────────────────────────────┐
│  API NestJS (Railway)                                          │
│  Helmet · CORS · Throttler · ValidationPipe(whitelist)         │
│  CorrelationId · SupabaseAuthGuard · RolesGuard · CotizacionTokenGuard │
├──────────────────────────────────────────────────────────────┤
│  seguridad · administracion · cotizacion · ★prueba-choque      │
│  compra · pagos · polizas · asesoria-retencion · reportes      │
├──────────────────────────────────────────────────────────────┤
│  integracion/ (adaptadores): Estrategia×5 · PasarelaSimulada   │
│  AseguradoraSimulada · PdfKitGenerador · NotificadorSimulado   │
│  ClasificadorPorPalabrasClave | ClasificadorLLM (flag)          │
└─────────┬───────────────────────────┬─────────────────────────┘
          │ supabase-js (anon + JWT)  │ supabase-js (service_role)
┌─────────▼───────────────────────────▼─────────────────────────┐
│  SUPABASE                                                       │
│  Postgres esquema svas (RLS en todo) · RPC SECURITY DEFINER     │
│  Auth (JWT, app_metadata.roles) · Storage (bucket privado polizas)│
└───────────────────────────────────────────────────────────────┘
```

---

## 2. Estructura completa de carpetas

Cada módulo de dominio repite las 4 capas
(`domain/application/infrastructure/presentation`). Se expanden
`cotizacion`, `prueba-choque` y `compra` como referencia.

```
svas-backend/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/
│   │   ├── configuration.ts
│   │   ├── env.validation.ts               # zod: falla al arrancar si falta una variable
│   │   └── supabase.config.ts
│   │
│   ├── common/
│   │   ├── decorators/
│   │   │   ├── current-user.decorator.ts
│   │   │   ├── roles.decorator.ts           # @Roles('ASESOR','ADMINISTRADOR')
│   │   │   ├── public.decorator.ts          # @Public() para login, catálogo, cotizar
│   │   │   └── cotizacion-token.decorator.ts
│   │   ├── filters/
│   │   │   ├── http-exception.filter.ts     # forma única de error (doc conexión §8)
│   │   │   └── postgrest-error.filter.ts    # traduce códigos PG/RAISE a 400/403/404/409
│   │   ├── guards/
│   │   │   ├── supabase-auth.guard.ts       # global; respeta @Public()
│   │   │   ├── roles.guard.ts               # lee app_metadata.roles + verifica svas.usuario.activo
│   │   │   ├── cotizacion-token.guard.ts    # flujo anónimo: hash(token) = cotizacion.token_acceso_hash
│   │   │   └── throttler-behind-proxy.guard.ts
│   │   ├── interceptors/
│   │   │   ├── logging.interceptor.ts
│   │   │   ├── sanitize-response.interceptor.ts  # nunca devuelve token_acceso_hash ni enlace_token; quita detalleCalculo si el rol no es ASESOR/ADMIN
│   │   │   ├── idempotency.interceptor.ts   # Idempotency-Key en POST /compras/:id/pago
│   │   │   └── timeout.interceptor.ts
│   │   ├── pipes/validation.pipe.ts
│   │   ├── middlewares/correlation-id.middleware.ts
│   │   └── utils/
│   │       ├── mask.util.ts                 # enmascarar documento/teléfono (doc contexto §7)
│   │       ├── token.util.ts                # generar token aleatorio + sha256
│   │       └── money.util.ts                # aritmética decimal (no float): decimal.js
│   │
│   ├── infrastructure/
│   │   ├── database/
│   │   │   ├── supabase-user-client.factory.ts   # cliente anon + JWT del usuario → RLS aplica
│   │   │   ├── supabase-service-client.provider.ts # service_role — solo flujos públicos y jobs
│   │   │   └── rpc.helper.ts                # llama RPC, mapea error, añade correlationId
│   │   ├── storage/supabase-storage.service.ts
│   │   ├── scheduler/advisory-lock.service.ts  # pg_try_advisory_lock para jobs
│   │   ├── observability/health.controller.ts  # /health/live, /health/ready
│   │   └── logger/audit-logger.service.ts
│   │
│   ├── integracion/                         # adaptadores de puertos (paquete de la Práctica 2)
│   │   ├── estrategias/
│   │   │   ├── estrategia.registry.ts       # Map<codigo_estrategia, EstrategiaCotizacion>
│   │   │   ├── estrategia-base.ts           # pasos comunes: rango, suma, pesos, redondeo, mensual, desglose
│   │   │   ├── estrategia-rimac.ts          # tb × wMarca × wModelo × wAño
│   │   │   ├── estrategia-pacifico.ts       # … × wUbigeo + cargo fijo anual
│   │   │   ├── estrategia-la-positiva.ts    # … × wTipo ; cuotas con recargo (override totalEnCuotas)
│   │   │   ├── estrategia-mapfre.ts         # MAX(S × tasa, prima mínima)
│   │   │   └── estrategia-qualitas.ts       # promedio de pesos × (1 − descuento comercial)
│   │   ├── pagos/pasarela-simulada.adapter.ts
│   │   ├── emision/aseguradora-simulada.adapter.ts
│   │   ├── pdf/pdfkit-generador.adapter.ts
│   │   ├── mensajes/notificador-simulado.adapter.ts
│   │   └── clasificador/
│   │       ├── clasificador-palabras-clave.adapter.ts
│   │       └── clasificador-llm.adapter.ts  # opcional, FEATURE_CLASIFICADOR_LLM=true
│   │
│   ├── modules/
│   │   ├── seguridad/                       # Ola 0
│   │   │   ├── auth.controller.ts           # /auth/login, /auth/registro, /auth/refresh
│   │   │   ├── usuarios.controller.ts       # /usuarios/me, /admin/usuarios
│   │   │   ├── application/ …
│   │   │   └── seguridad.module.ts
│   │   │
│   │   ├── administracion/                  # Ola 0 — catálogo + parámetros + tarifas (+ reglas ★ en Ola 2)
│   │   │   ├── tarifas/                     # doc de dominio §17: tasas, pesos y rangos por aseguradora
│   │   │   │   ├── tarifas.controller.ts    # /admin/tarifas/{planes, pesos/:tabla, rangos-suma, simular, completitud}
│   │   │   │   ├── guardar-tarifa-plan.use-case.ts   # valida `parametros` con el zod de la Estrategia
│   │   │   │   ├── guardar-pesos.use-case.ts         # carga masiva a peso_marca|modelo|anio|tipo|ubigeo
│   │   │   │   ├── guardar-rangos-suma.use-case.ts
│   │   │   │   ├── simular-tarifa.use-case.ts        # reutiliza las Estrategias; devuelve el desglose
│   │   │   │   ├── consultar-completitud.use-case.ts # lee v_tarifa_completitud
│   │   │   │   └── dto/
│   │   │   ├── contenido-planes/            # doc de dominio §18: qué cubre / no cubre / requisitos por plan
│   │   │   │   ├── contenido-planes.controller.ts    # /admin/planes/:planId/contenido, /admin/coberturas, /admin/contenido-planes/completitud
│   │   │   │   ├── guardar-contenido-plan.use-case.ts    # zod + validarContenidoPlan() (RN-42/43) + RPC admin_guardar_plan_contenido
│   │   │   │   ├── guardar-cobertura-catalogo.use-case.ts
│   │   │   │   ├── consultar-completitud-contenido.use-case.ts # lee v_plan_contenido_completitud
│   │   │   │   └── dto/
│   │   │   └── (domain/application/infrastructure/presentation del resto del módulo)
│   │   │
│   │   ├── cotizacion/                      # Ola 1
│   │   │   ├── domain/
│   │   │   │   ├── cotizacion.entity.ts     # habilitarOpciones(), marcarConvertida()
│   │   │   │   ├── derivacion.policy.ts     # RN-01..RN-06 como función pura
│   │   │   │   ├── nicho.policy.ts          # RN-05
│   │   │   │   ├── formulario-dinamico.ts   # unión de campos (RN-17) + validación (RF-03)
│   │   │   │   ├── tarifa.types.ts          # TarifaAseguradora, PlanTarifa, ResultadoPlan (3.6.1)
│   │   │   │   ├── suma-asegurada.policy.ts # RN-37: rango, punto medio, SumaFueraDeRangoException
│   │   │   │   ├── estrategia-cotizacion.port.ts
│   │   │   │   ├── tarifa.repository.port.ts
│   │   │   │   └── cotizacion.repository.port.ts
│   │   │   ├── application/
│   │   │   │   ├── obtener-campos.use-case.ts
│   │   │   │   ├── obtener-catalogo-vehiculos.use-case.ts  # marcas → modelos → años; ubigeos
│   │   │   │   ├── cotizar.use-case.ts
│   │   │   │   ├── ajustar-suma-asegurada.use-case.ts      # RN-37 + RPC 6.13
│   │   │   │   ├── obtener-resumen.use-case.ts
│   │   │   │   └── actualizar-contacto.use-case.ts
│   │   │   ├── infrastructure/
│   │   │   │   ├── cotizacion-supabase.repository.ts
│   │   │   │   └── tarifa-supabase.repository.ts           # carga la tarifa de una aseguradora + caché 5 min
│   │   │   ├── presentation/
│   │   │   │   ├── catalogo.controller.ts   # GET /catalogo/campos
│   │   │   │   ├── catalogo-vehiculos.controller.ts  # GET /catalogo/vehiculos/*, /catalogo/ubigeos/*
│   │   │   │   ├── cotizaciones.controller.ts        # incluye PATCH …/aseguradoras/:id/suma-asegurada
│   │   │   │   └── dto/ (cotizar.dto.ts, ajustar-suma.dto.ts, cotizacion-response.dto.ts, …)
│   │   │   └── cotizacion.module.ts
│   │   │
│   │   ├── planes/                          # Ola 2 — contenido comercial de los planes (lectura)
│   │   │   ├── domain/
│   │   │   │   ├── contenido-plan.types.ts          # ContenidoPlan, CoberturaDePlan, Exclusion, Requisito
│   │   │   │   ├── validar-contenido-plan.ts        # función pura: RN-42 (todas las coberturas) y RN-43 (vs Prueba de Choque)
│   │   │   │   └── contenido-plan.repository.port.ts
│   │   │   ├── application/
│   │   │   │   ├── obtener-contenido-plan.use-case.ts   # una tarjeta de detalle
│   │   │   │   ├── comparar-planes.use-case.ts          # matriz cobertura × plan (máx. 3 planes)
│   │   │   │   └── armar-copia-contenido.service.ts     # arma el snapshot para crear_orden_compra (RN-45)
│   │   │   ├── infrastructure/contenido-plan-supabase.repository.ts   # caché 5 min; se invalida al guardar
│   │   │   ├── presentation/
│   │   │   │   ├── planes.controller.ts     # GET /planes/:planId/contenido, GET /planes/comparar
│   │   │   │   └── dto/ (contenido-plan-response.dto.ts, comparar-planes-response.dto.ts)
│   │   │   └── planes.module.ts
│   │   │
│   │   ├── prueba-choque/                   # Ola 2 ★
│   │   │   ├── domain/
│   │   │   │   ├── motor-simulacion.ts      # función pura: simular(primas, reglas, perfil) → resultado
│   │   │   │   ├── perfil-riesgo.vo.ts      # value object validado
│   │   │   │   ├── escenario.entity.ts
│   │   │   │   ├── clasificador-preocupaciones.port.ts
│   │   │   │   └── reglas-simulacion.repository.port.ts
│   │   │   ├── application/
│   │   │   │   ├── listar-escenarios.use-case.ts
│   │   │   │   ├── ejecutar-prueba-choque.use-case.ts
│   │   │   │   ├── obtener-ultima-simulacion.use-case.ts
│   │   │   │   └── generar-resumen-retencion.use-case.ts   # frase de contraste RN-35
│   │   │   ├── infrastructure/reglas-simulacion-supabase.repository.ts
│   │   │   ├── presentation/
│   │   │   │   ├── prueba-choque.controller.ts
│   │   │   │   └── dto/ (ejecutar-prueba-choque.dto.ts, prueba-choque-response.dto.ts)
│   │   │   └── prueba-choque.module.ts
│   │   │
│   │   ├── asesoria-retencion/              # Ola 2
│   │   │   ├── domain/ (solicitud-asesoria.entity.ts, seguimiento.entity.ts → puedeContactar(),
│   │   │   │            notificador-mensajes.port.ts)
│   │   │   ├── application/ (… , detector-abandono.job.ts, caducidad-seguimiento.job.ts)
│   │   │   ├── infrastructure/
│   │   │   ├── presentation/ (asesorias.controller.ts, seguimientos.controller.ts, retoma.controller.ts)
│   │   │   └── asesoria-retencion.module.ts
│   │   │
│   │   ├── pagos/                           # Ola 3 — sin controller
│   │   │   └── domain/pasarela-pago.port.ts, application/procesar-pago.service.ts
│   │   │
│   │   ├── polizas/                         # Ola 3
│   │   │   ├── domain/ (emision-aseguradora.port.ts, generador-pdf.port.ts)
│   │   │   ├── application/ (emitir-pdf.use-case.ts, descargar-poliza.use-case.ts,
│   │   │   │                 regenerar-pdf-pendiente.job.ts)
│   │   │   └── presentation/polizas.controller.ts
│   │   │
│   │   ├── compra/                          # Ola 3
│   │   │   ├── domain/ (orden-compra.entity.ts, campos-faltantes.policy.ts)
│   │   │   ├── application/
│   │   │   │   ├── obtener-campos-faltantes.use-case.ts
│   │   │   │   ├── guardar-datos.use-case.ts
│   │   │   │   ├── crear-orden.use-case.ts
│   │   │   │   ├── pagar-y-emitir.use-case.ts   # orquesta pagos + polizas + RPC confirmar_compra
│   │   │   │   └── consultar-estado.use-case.ts
│   │   │   └── presentation/compras.controller.ts
│   │   │
│   │   └── reportes/                        # Ola 4
│   │       └── presentation/reportes.controller.ts
│   │
│   └── shared/
│       ├── types/roles.ts                   # 'CLIENTE' | 'ASESOR' | 'ADMINISTRADOR'
│       ├── types/enums.ts                   # espejo de los 19 enums de Postgres
│       └── dto/warning.dto.ts               # { code, message }
│
├── supabase/
│   ├── migrations/ (0001 … 0021, doc contexto §9)
│   └── seed/ (datos de prueba sintéticos para carga, no van a producción)
├── test/
│   ├── unit/        # dominio puro: derivación, nicho, formulario, motor de simulación, estrategias
│   ├── integration/ # RPCs y RLS contra Supabase local (supabase start)
│   └── e2e/         # CU-01..CU-05 + prueba de choque con supertest
├── .env.example
├── nest-cli.json
└── package.json
```

---

## 3. Explicación detallada de cada carpeta y módulo

### 3.1 `main.ts`
Prefijo global `/api/v1`, Helmet, CORS solo para el dominio de Vercel y
`localhost:5173`, `ValidationPipe({ whitelist: true,
forbidNonWhitelisted: true, transform: true })`, Swagger en `/api/docs`
con esquemas `bearer` y `X-Cotizacion-Token`, filtros globales y
`app.set('trust proxy', 1)` (Railway está detrás de proxy; necesario para
que el throttler vea la IP real).

### 3.2 `app.module.ts`
Registra `ConfigModule` (validado con zod), `ThrottlerModule`
(perfiles: `default` 100 req/min; `publico` 20 req/min por IP para
`POST /cotizaciones`, `POST /prueba-choque` y `/auth/*`),
`ScheduleModule`, guards globales (`SupabaseAuthGuard`, `RolesGuard`) y
todos los módulos.

### 3.3 `config/`
Variables obligatorias: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `FRONTEND_URL`,
`PORT`, `NODE_ENV`. Opcionales: `FEATURE_CLASIFICADOR_LLM`,
`ANTHROPIC_API_KEY` (solo si el flag está activo), `REDIS_URL`.

### 3.4 `common/`
- **`supabase-auth.guard.ts`**: verifica la firma del JWT con
  `SUPABASE_JWT_SECRET` (sin llamada de red) y adjunta `{ id, email,
  roles }` desde `app_metadata.roles`. Rutas `@Public()` pasan sin JWT.
- **`roles.guard.ts`**: compara `@Roles()` con `user.roles` **y** confirma
  `svas.usuario.activo = true` (cache 60 s). Un usuario desactivado con JWT
  aún vigente queda fuera de inmediato.
- **`cotizacion-token.guard.ts`**: para rutas anónimas con `:id` de
  cotización. Si hay JWT de `CLIENTE` dueño, pasa; si no, exige
  `X-Cotizacion-Token` y compara `sha256(token)` con
  `cotizacion.token_acceso_hash` en tiempo constante.
- **`postgrest-error.filter.ts`**: `P0001` (RAISE) → 400 con el mensaje
  del RPC; `23505` → 409; `23503`/`23514` → 400 con mensaje genérico;
  `42501` → 403. Nunca filtra nombres de tabla ni SQL.
- **`sanitize-response.interceptor.ts`**: elimina recursivamente
  `token_acceso_hash`, `enlace_token` y cualquier clave `*_hash`; elimina
  también `detalleCalculo` (desglose de la prima, RN-41) cuando el usuario no
  es `ASESOR` ni `ADMINISTRADOR`.

### 3.5 `infrastructure/`
- **Dos clientes Supabase, nunca uno genérico** (4.2).
- **`rpc.helper.ts`**: `callRpc<T>(client, nombre, params)`; tipado con
  los tipos generados por `supabase gen types typescript --schema svas`.
- **`advisory-lock.service.ts`**: `pg_try_advisory_lock(hash('detector'))`
  antes de cada job; si no obtiene el lock, otra instancia lo está
  corriendo y sale.

### 3.6 `modules/` — detalle por módulo

| Módulo | Endpoints | Roles | RPCs que usa |
|---|---|---|---|
| `seguridad` | `POST /auth/login`, `POST /auth/registro`, `POST /auth/refresh`, `GET /usuarios/me`, `GET /admin/usuarios`, `POST /admin/usuarios`, `PATCH /admin/usuarios/:id/rol`, `PATCH /admin/usuarios/:id/estado` | público / todos / ADMIN | `admin_cambiar_rol_usuario` |
| `administracion` | `GET /admin/panel`, `GET/PATCH /admin/aseguradoras[/:id]`, `GET/POST/PATCH /admin/planes[/:id]`, `GET/POST/PUT/DELETE /admin/campos[/:id]`, `GET/PUT /admin/reglas-inspeccion`, `GET/PUT /admin/parametros`, `GET /admin/bitacora`, **`GET /admin/tarifas/planes`, `PUT /admin/tarifas/planes/:planId`, `GET/PUT /admin/tarifas/pesos/:tabla`, `GET/PUT /admin/tarifas/rangos-suma`, `POST /admin/tarifas/simular`, `GET /admin/tarifas/completitud`** | ADMIN | 6.12 (`admin_guardar_tarifa_plan`, `admin_guardar_pesos`, `admin_guardar_rangos_suma`) |
| `administracion` (contenido) ★ | `GET /admin/planes/:planId/contenido`, `PUT /admin/planes/:planId/contenido`, `GET/POST/PUT /admin/coberturas[/:id]`, `GET /admin/contenido-planes/completitud` | ADMIN | `admin_guardar_plan_contenido`, `admin_guardar_cobertura_catalogo` |
| `planes` ★ | `GET /planes/:planId/contenido`, `GET /planes/comparar?ids=` | público+token / CLIENTE / ASESOR | — (lectura) |
| `administracion` ★ | `GET/PUT /admin/prueba-choque/escenarios`, `/coberturas`, `/frecuencias`, `/zonas`, `/factores` | ADMIN | `admin_guardar_*` ★ |
| `cotizacion` | `GET /catalogo/campos`, `GET /catalogo/vehiculos/marcas`, `GET /catalogo/vehiculos/marcas/:marcaId/modelos`, `GET /catalogo/vehiculos/modelos/:modeloId/anios`, `GET /catalogo/ubigeos/{departamentos,provincias,distritos}`, `POST /cotizaciones`, `GET /cotizaciones/:id/resumen`, **`PATCH /cotizaciones/:id/aseguradoras/:aseguradoraId/suma-asegurada`**, `PATCH /cotizaciones/:id/cliente`, `GET /cotizaciones/mias` | público+token / CLIENTE | `registrar_cotizacion`, `actualizar_suma_asegurada` |
| `prueba-choque` ★ | `GET /prueba-choque/escenarios?uso=`, `POST /cotizaciones/:id/prueba-choque`, `GET /cotizaciones/:id/prueba-choque`, `GET /cotizaciones/:id/prueba-choque/pdf`, `POST /prueba-choque/clasificar` (flag) | público+token / CLIENTE / ASESOR lectura | `registrar_simulacion` |
| `compra` | `GET /compras/resumen?cotizacionId=`, `GET /compras/:cotizacionId/campos-faltantes`, `PUT /compras/:cotizacionId/datos`, `POST /compras`, `POST /compras/:id/pago`, `GET /compras/:id/estado` | CLIENTE | `crear_orden_compra` (con la copia del contenido del plan), `confirmar_compra`, `registrar_pago_rechazado` |
| `polizas` | `GET /polizas/mias`, `GET /polizas/:id/pdf` | CLIENTE | — |
| `asesoria-retencion` | `POST /asesorias` | CLIENTE | inserción vía RPC |
| `asesoria-retencion` | `GET /asesorias/cola`, `GET /asesorias/:id`, `POST /asesorias/:id/tomar`, `POST /asesorias/:id/descuentos`, `POST /asesorias/:id/resultado`, `GET /seguimientos`, `GET /seguimientos/:id`, `POST /seguimientos/:id/intentos`, `POST /seguimientos/:id/aceptacion`, `POST /seguimientos/:id/cierre` | ASESOR | 6.5 a 6.9 |
| `asesoria-retencion` | `GET /retoma/:token` | público | `resolver_enlace_retoma` |
| `reportes` | `GET /admin/reportes/ventas`, `/retencion`, `/descuentos`, `/prueba-choque`, `GET /asesor/reportes/mi-desempeno` | ADMIN / ASESOR | vistas SQL |

#### 3.6.1 `cotizacion` — cotizar en detalle

El cálculo de la prima tiene **tres piezas** (qué significa cada número y los
ejemplos completos están en el doc de dominio, sección 17):

| Pieza | Qué es | Dónde vive |
|---|---|---|
| **Tarifa** | Los datos de **una** aseguradora ya en memoria: tasa base y parámetros de sus planes, pesos y rangos de suma | `TarifaAseguradora`, cargada por `TarifaRepository` |
| **Estrategia** | La fórmula de esa aseguradora (función pura, sin I/O) | `integracion/estrategias/*` |
| **Caso de uso** | Orquesta: carga tarifas, llama a las 5 estrategias, decide derivación y persiste (RPC) | `cotizar.use-case.ts`, `ajustar-suma-asegurada.use-case.ts` |

**Tipos y puertos** (dominio: sin NestJS ni Supabase)

```ts
// modules/cotizacion/domain/tarifa.types.ts
import Decimal from 'decimal.js';

export type PesoNombre = 'marca' | 'modelo' | 'anio' | 'tipo' | 'ubigeo';

export interface PlanTarifa {
  planId: string; nombre: string;
  tasaBase: Decimal;                         // tarifa_plan.tasa_base
  parametros: Record<string, unknown>;       // tarifa_plan.parametros (lo valida el zod de la Estrategia)
}

/** Todo lo que una aseguradora necesita para calcular. Ya cargado: la Estrategia no hace I/O. */
export interface TarifaAseguradora {
  aseguradoraId: string;
  planes: PlanTarifa[];
  rangos: Map<string, { minima: Decimal; maxima: Decimal }>;  // clave `${modeloId}:${anio}`
  pesoMarca: Map<string, Decimal>;    // por marcaId
  pesoModelo: Map<string, Decimal>;   // por modeloId
  pesoAnio: Map<number, Decimal>;     // por año
  pesoTipo: Map<string, Decimal>;     // por tipoId   (solo La Positiva)
  pesoUbigeo: Map<string, Decimal>;   // por ubigeo   (solo Pacífico)
}

export interface VehiculoCotizable {
  marcaId: string; modeloId: string; tipoId: string; anio: number; ubigeo: string;
}

export interface ResultadoPlan {
  planId: string;
  disponible: boolean;
  motivoNoDisponible?: 'SIN_RANGO' | 'PESO_FALTANTE' | 'ERROR_ESTRATEGIA';   // RN-39
  sumaAsegurada?: Decimal;
  prima?: Decimal;              // prima ANUAL (al contado)
  primaMensual?: Decimal;       // cuota si paga en 12 meses (RN-38)
  detalleCalculo?: Record<string, unknown>;   // RN-41: instantánea del cálculo
}
```

```ts
// modules/cotizacion/domain/estrategia-cotizacion.port.ts
export interface EstrategiaCotizacion {
  readonly codigo: 'RIMAC' | 'PACIFICO' | 'LA_POSITIVA' | 'MAPFRE' | 'QUALITAS';
  readonly parametrosSchema: z.ZodTypeAny;   // valida tarifa_plan.parametros al guardar y al cargar

  /** Un ResultadoPlan por plan. Sin `suma` usa el punto medio del rango (RN-37).
   *  Suma fuera de rango → lanza SumaFueraDeRangoException (400, no "no disponible"). */
  cotizar(v: VehiculoCotizable, tarifa: TarifaAseguradora, suma?: Decimal): Promise<ResultadoPlan[]>;

  /** Total que paga el cliente en cuotas sobre la prima final (ya con descuento, RN-38).
   *  En pago único el total es prima_final y esta función no se usa. */
  totalEnCuotas(primaFinal: Decimal, plan: PlanTarifa): Decimal;
}

// modules/cotizacion/domain/tarifa.repository.port.ts
export interface TarifaRepository {
  cargar(aseguradoraId: string): Promise<TarifaAseguradora>;   // caché 5 min
  invalidar(aseguradoraId?: string): void;                     // lo llama el admin al guardar tarifas
}
```

`cotizar()` devuelve `Promise` aunque hoy las fórmulas sean síncronas: así, el
día que una aseguradora tenga API real (RNF-15), se reemplaza **solo** la
clase y nada más cambia.

**La clase base: los pasos que son iguales para todas**

```ts
// integracion/estrategias/estrategia-base.ts
export abstract class EstrategiaBase implements EstrategiaCotizacion {
  abstract readonly codigo: EstrategiaCotizacion['codigo'];
  abstract readonly parametrosSchema: z.ZodTypeAny;
  /** Qué tablas de peso exige la fórmula de esta aseguradora. */
  protected abstract pesosRequeridos(): readonly PesoNombre[];
  /** LO ÚNICO QUE CAMBIA ENTRE ASEGURADORAS: la fórmula de la prima anual de un plan. */
  protected abstract primaAnual(c: { S: Decimal; plan: PlanTarifa; w: Record<PesoNombre, Decimal> }):
    { prima: Decimal; paso: Record<string, unknown> };

  async cotizar(v: VehiculoCotizable, tarifa: TarifaAseguradora, suma?: Decimal): Promise<ResultadoPlan[]> {
    const rango = tarifa.rangos.get(`${v.modeloId}:${v.anio}`);
    if (!rango) return tarifa.planes.map(p => noDisponible(p, 'SIN_RANGO'));            // RN-39
    const S = suma ?? puntoMedio(rango);                      // múltiplos de USD 100, half-up
    if (S.lt(rango.minima) || S.gt(rango.maxima)) throw new SumaFueraDeRangoException(rango);  // RN-37
    const w = resolverPesos(this.pesosRequeridos(), v, tarifa);   // null si falta alguno obligatorio
    if (!w) return tarifa.planes.map(p => noDisponible(p, 'PESO_FALTANTE'));            // RN-39
    return tarifa.planes.map(plan => {
      const { prima, paso } = this.primaAnual({ S, plan, w: w.pesos });
      const anual = redondear2(prima);
      return {
        planId: plan.planId, disponible: true, sumaAsegurada: S, prima: anual,
        primaMensual: redondear2(this.totalEnCuotas(anual, plan).div(12)),
        detalleCalculo: { estrategia: this.codigo, S, tasaBase: plan.tasaBase,
                          pesos: w.pesos, ubigeoPorDefecto: w.ubigeoPorDefecto, ...paso },   // RN-41
      };
    });
  }
  /** Por defecto sin recargo: cuotas = prima ÷ 12. La Positiva lo sobrescribe. */
  totalEnCuotas(primaFinal: Decimal, _plan: PlanTarifa): Decimal { return primaFinal; }
}
```

**Las cinco estrategias** (cada una = su fórmula; los números de ejemplo son
los de la sección 17.5 del doc de dominio)

```ts
// RÍMAC — producto de cuatro factores
export class EstrategiaRimac extends EstrategiaBase {
  readonly codigo = 'RIMAC'; readonly parametrosSchema = z.object({}).strict();
  protected pesosRequeridos() { return ['marca', 'modelo', 'anio'] as const; }
  protected primaAnual({ S, plan, w }) {
    const tasa = plan.tasaBase.mul(w.marca).mul(w.modelo).mul(w.anio);
    return { prima: S.mul(tasa), paso: { tasa } };
  }
}

// PACÍFICO — suma el ubigeo y un cargo fijo por póliza
export class EstrategiaPacifico extends EstrategiaBase {
  readonly codigo = 'PACIFICO';
  readonly parametrosSchema = z.object({ cargo_fijo_anual: z.number().nonnegative() }).strict();
  protected pesosRequeridos() { return ['marca', 'modelo', 'anio', 'ubigeo'] as const; }  // ubigeo sin peso → 1,00
  protected primaAnual({ S, plan, w }) {
    const tasa = plan.tasaBase.mul(w.marca).mul(w.modelo).mul(w.anio).mul(w.ubigeo);
    const cargoFijo = new Decimal(plan.parametros.cargo_fijo_anual as number);
    return { prima: S.mul(tasa).add(cargoFijo), paso: { tasa, cargoFijo } };
  }
}

// LA POSITIVA — suma el tipo de vehículo y recarga el pago en cuotas
export class EstrategiaLaPositiva extends EstrategiaBase {
  readonly codigo = 'LA_POSITIVA';
  readonly parametrosSchema = z.object({ recargo_pago_mensual: z.number().min(0).max(1) }).strict();
  protected pesosRequeridos() { return ['marca', 'modelo', 'anio', 'tipo'] as const; }
  protected primaAnual({ S, plan, w }) {
    const tasa = plan.tasaBase.mul(w.marca).mul(w.modelo).mul(w.anio).mul(w.tipo);
    return { prima: S.mul(tasa), paso: { tasa } };
  }
  override totalEnCuotas(primaFinal: Decimal, plan: PlanTarifa) {          // RN-38
    return primaFinal.mul(new Decimal(1).add(plan.parametros.recargo_pago_mensual as number));
  }
}

// MAPFRE — la prima nunca baja de la prima mínima del plan
export class EstrategiaMapfre extends EstrategiaBase {
  readonly codigo = 'MAPFRE';
  readonly parametrosSchema = z.object({ prima_minima_anual: z.number().positive() }).strict();
  protected pesosRequeridos() { return ['marca', 'modelo', 'anio'] as const; }
  protected primaAnual({ S, plan, w }) {
    const tasa = plan.tasaBase.mul(w.marca).mul(w.modelo).mul(w.anio);
    const calculada = S.mul(tasa);
    const minima = new Decimal(plan.parametros.prima_minima_anual as number);
    return { prima: Decimal.max(calculada, minima), paso: { tasa, calculada, minima, aplicoMinima: calculada.lt(minima) } };
  }
}

// QUALITAS — promedia los pesos (no los multiplica) y aplica descuento comercial
export class EstrategiaQualitas extends EstrategiaBase {
  readonly codigo = 'QUALITAS';
  readonly parametrosSchema = z.object({ descuento_comercial: z.number().min(0).max(1) }).strict();
  protected pesosRequeridos() { return ['marca', 'modelo', 'anio'] as const; }
  protected primaAnual({ S, plan, w }) {
    const pesoVehiculo = w.marca.add(w.modelo).add(w.anio).div(3);
    const desc = new Decimal(plan.parametros.descuento_comercial as number);
    return { prima: S.mul(plan.tasaBase).mul(pesoVehiculo).mul(new Decimal(1).sub(desc)),
             paso: { pesoVehiculo, descuentoComercial: desc } };
  }
}
```

**Caso de uso: cotizar** (carga la tarifa, llama a las 5 estrategias en
paralelo, persiste por RPC)

```ts
// application/cotizar.use-case.ts (resumen)
async execute(dto: CotizarDto): Promise<CotizacionResponseDto> {
  const catalogo = await this.catalogo.obtenerActivo();          // aseguradoras+planes (con resumen)+campos
  const errores = validarContraCatalogo(dto.datos, catalogo);    // RF-03 (dominio puro)
  if (errores.length) throw new CamposInvalidosException(errores);
  verificarNicho(dto.vehiculo, await this.repo.contarVehiculos(dto.contacto)); // RN-05
  const v = await this.vehiculos.resolver(dto.vehiculo, dto.ubicacion);       // modeloId → marcaId, tipoId

  const resultados = await Promise.allSettled(                   // RF-05: una caída no bloquea
    catalogo.aseguradoras.map(async a => {
      const tarifa = await this.tarifas.cargar(a.id);            // caché 5 min
      return withTimeout(this.registry.get(a.codigoEstrategia).cotizar(v, tarifa), 2000);
    }));
  const primas = normalizar(resultados, catalogo);               // fallo/timeout → disponible=false, ERROR_ESTRATEGIA
  const decision = decidirDerivacion(dto.vehiculo.uso, primas, catalogo.reglasInspeccion); // RN-01..04

  const token = generarToken();                                  // 32 bytes base64url
  const r = await this.repo.registrar({ ...dto, primas, decision, tokenHash: sha256(token) }); // RPC 6.1
  return { ...r, tokenAcceso: token,
           warning: primas.some(p => !p.disponible) ? WARN_ASEGURADORA_SIN_COTIZACION : undefined };
}
```

**Caso de uso: ajustar la suma asegurada** (RN-37; el frontend nunca calcula)

```ts
// application/ajustar-suma-asegurada.use-case.ts
async execute({ cotizacionId, aseguradoraId, sumaAsegurada }: AjustarSumaDto) {
  const cot = await this.repo.obtenerParaAjuste(cotizacionId, aseguradoraId); // vehículo, estado, ¿tiene orden?
  if (cot.estado === 'CONVERTIDA' || cot.tieneOrden)
    throw new ConflictException('Ya iniciaste tu compra: la suma asegurada ya no se puede cambiar.'); // 409
  const tarifa = await this.tarifas.cargar(aseguradoraId);
  const estrategia = this.registry.get(cot.codigoEstrategia);
  const resultados = await estrategia.cotizar(cot.vehiculo, tarifa, new Decimal(sumaAsegurada)); // lanza SumaFueraDeRango
  const r = await this.repo.actualizarSuma(cotizacionId, aseguradoraId, resultados);  // RPC 6.13 (revalida el rango)
  return { primas: r.primas,
           warning: r.simulacionesInvalidadas > 0 ? WARN_SIMULACION_DESACTUALIZADA : undefined };
}
```

`SumaFueraDeRangoException` se traduce a `400` con `errors: [{ campo:
'sumaAsegurada', mensaje: 'Fuera del rango permitido (12000.00 – 16800.00)' }]`.

**`TarifaSupabaseRepository`** (infraestructura): para una aseguradora ejecuta
siete lecturas (`tarifa_plan` + `plan`, `rango_suma_asegurada`, `peso_marca`,
`peso_modelo`, `peso_anio`, `peso_tipo`, `peso_ubigeo`), arma los `Map` de
`TarifaAseguradora` y valida cada `parametros` con el `parametrosSchema` de la
Estrategia (si no cumple: log + esa aseguradora sale con `ERROR_ESTRATEGIA`
hasta que el administrador lo corrija). Caché en memoria de 5 min por
aseguradora; `invalidar()` lo dispara el mismo evento que invalida las reglas
de la Prueba de Choque cuando un RPC admin de tarifas termina. Usa el cliente
de servicio (4.2): las tablas de tarifa no son legibles por CLIENTE ni ASESOR.

**Pruebas unitarias de las estrategias** (sin base de datos; la tabla de
casos sale de la sección 17.6 del doc de dominio)

| Caso | Estrategia / plan | Entrada | Esperado (anual / mensual) |
|---|---|---|---|
| Caso dorado Rímac | Oro | Corolla 2022, S = 15 000 | 640,40 / 53,37 |
| Caso dorado Rímac | Plata | ídem | 457,43 / 38,12 |
| Caso dorado Pacífico | Premium · Básico | ídem, ubigeo 150122 | 615,36 / 51,28 · 429,25 / 35,77 |
| Caso dorado La Positiva | Full · Clásico | ídem | 651,79 / 57,03 · 454,74 / 39,79 |
| Caso dorado Mapfre | Total · Esencial | ídem | 610,47 / 50,87 · 431,80 / 35,98 |
| Caso dorado Qualitas | Plus · Estándar | ídem | 635,36 / 52,95 · 447,64 / 37,30 |
| Piso de Mapfre | Esencial | Kia Picanto 2015, S = 3 000 | 180,00 / 15,00 (`aplicoMinima = true`) |
| Rangos extremos | Rímac Oro | S = 12 000 · S = 16 800 | 512,32 · 717,24 |
| Suma fuera de rango | cualquiera | S = mínima − 1 | lanza `SumaFueraDeRangoException` |
| Sin rango | cualquiera | modelo-año sin fila | `disponible = false`, `SIN_RANGO` |
| Peso faltante | Rímac | sin `peso_modelo` | `disponible = false`, `PESO_FALTANTE` |
| Ubigeo sin peso | Pacífico | ubigeo no cargado | cotiza con wU = 1,00, `ubigeoPorDefecto = true` |
| Suma por defecto | todas | sin `suma` | punto medio redondeado a 100 (Rímac 14 400) |
| Cuotas con recargo | La Positiva Full | prima_final 619,20 | total 650,16 → cuota 54,18 |

Propiedades que se verifican con datos generados: (1) para el mismo auto y plan,
subir la suma nunca baja la prima (salvo el piso de Mapfre, donde queda igual);
(2) `primaMensual × 12` está a menos de USD 0,12 del total en cuotas;
(3) `prima` y `primaMensual` siempre con 2 decimales; (4) una Estrategia no
modifica los `Map` de la tarifa que recibe (es pura).

#### 3.6.2 `prueba-choque` — el motor ★

```ts
// domain/motor-simulacion.ts — función pura, sin I/O
export function simular(input: {
  primas: PrimaPlan[]; escenarios: Escenario[]; coberturas: Map<string, Cobertura>;
  frecuencias: Map<string, number>; factores: Factor[]; perfil: PerfilRiesgo;
  uso: UsoVehiculo; zona: ZonaRiesgo; tipoCambio: Decimal;
}): ResultadoSimulacion { … }   // implementa el algoritmo de doc contexto §16.3 con decimal.js
// Cada PrimaPlan trae su `sumaAsegurada`: ese es el daño de ROBO_TOTAL y PERDIDA_TOTAL (doc contexto 16.2).
```

- Usa `decimal.js` para todos los montos (nunca `number` para dinero).
- La prueba unitaria fija casos de tabla: sin regla → incompleto; `cubre =
  false` → paga todo; deducible mínimo > daño → paga el daño; tope;
  ingreso perdido solo comercial; probabilidad acotada a 0,95; empates.
- `ejecutar-prueba-choque.use-case.ts` carga reglas (cacheadas 5 min; se
  invalidan cuando un RPC admin ★ las cambia), llama a `simular()`,
  persiste con `registrar_simulacion` y responde con `warning:
  DATOS_COBERTURA_INCOMPLETOS` si algún plan quedó incompleto (RN-30).

#### 3.6.3 `compra` — pagar y emitir
Ver flujo completo en la sección 6. Al crear la orden, `crear-orden.use-case.ts`
pide a `ArmarCopiaContenidoService` (módulo `planes`) la copia del contenido
del plan elegido y la pasa a la RPC como `p_contenido_plan` (RN-45); el PDF de
la póliza se genera desde `orden_compra.contenido_plan`, no desde las tablas
vivas.

#### 3.6.4 `asesoria-retencion` — jobs
- `detector-abandono.job.ts`: `@Cron('0 * * * *')` → advisory lock →
  RPC 6.10 → log con cantidad.
- `caducidad-seguimiento.job.ts`: `@Cron('0 8 * * *', { timeZone:
  'America/Lima' })` → cierra vencidos → para cada uno: RPC 6.9 → arma
  mensaje con `generar-resumen-retencion.use-case.ts` (RN-35) →
  `NotificadorMensajes.enviar(canalPreferido, texto)`.

#### 3.6.5 `planes` — contenido comercial de cada plan ★

Responde "¿qué cubre, qué no cubre y qué necesito?" para cada plan. **No
interviene en la prima**: las fórmulas siguen en 3.6.1. Las tablas y su
contenido están en el doc de dominio (4.1 grupo D8 y sección 18).

```ts
// domain/contenido-plan.types.ts
export type CategoriaCobertura = 'DANOS_PROPIOS'|'ROBO'|'RESPONSABILIDAD'|'ASISTENCIA'|'ADICIONAL';
export type TipoRequisito = 'VEHICULO'|'CONDUCTOR'|'DOCUMENTO'|'INSPECCION';

export interface CoberturaDePlan {
  codigo: string;                  // 'ROBO_TOTAL'
  nombre: string;
  categoria: CategoriaCobertura;
  incluida: boolean;               // false = "no cubre" (fila explícita, RN-42)
  detalle: string | null;          // 'Hasta USD 100,000'
  limiteMonto: string | null;      // decimal como string; nulo si no aplica
  orden: number;
}
export interface ContenidoPlan {
  planId: string; aseguradora: string; plan: string;
  resumen: string; descripcion: string; idealPara: string;
  coberturas: CoberturaDePlan[];   // SIEMPRE todas las del catálogo activo
  exclusiones: string[];
  requisitos: { tipo: TipoRequisito; texto: string; obligatorio: boolean }[];
  actualizadoEn: string;
}
export interface CopiaContenidoPlan extends ContenidoPlan { congeladoEn: string }   // RN-45
```

**`validarContenidoPlan(contenido, catalogo, coberturaEscenarios, reglasChoque)`**
es una función pura (sin I/O) que devuelve `{ errores, advertencias }`:

| Chequeo | Resultado | Regla |
|---|---|---|
| Falta una cobertura activa del catálogo | error `COBERTURA_FALTANTE` (bloquea guardar) | RN-42 |
| `incluida = false` con `limiteMonto` | error (`ck_plan_cobertura_coherente`) | — |
| Falta `resumen`, `descripcion` o `idealPara`; 0 requisitos; 0 exclusiones | error `CONTENIDO_INCOMPLETO` | RN-42 |
| `incluida = true` pero **todos** sus escenarios con `cubre = false` | advertencia `CONTENIDO_INCOHERENTE` | RN-43 |
| `incluida = false` pero algún escenario con `cubre = true` | advertencia `CONTENIDO_INCOHERENTE` | RN-43 |

Los errores impiden guardar o activar el plan; las advertencias se devuelven
en el `warning` de la respuesta y la pantalla de administración las muestra.
La misma función se usa en el seed 0021 (como `DO $$ … $$`) y en los tests, así
que hay **una sola definición** de qué es "completo" (18.10).

**Casos de prueba obligatorios (tabla de 3.9):**

| Caso | Entrada | Esperado |
|---|---|---|
| Plan completo y coherente (Rímac Oro) | 13 coberturas, 6 exclusiones + 1, 4 requisitos | sin errores ni advertencias |
| Falta una cobertura | 12 de 13 | `COBERTURA_FALTANTE` |
| "No cubre" como ausencia | plan sin fila de `LUNAS` | `COBERTURA_FALTANTE` (no se interpreta como ✗) |
| Robo de autopartes ✗ pero la regla de choque lo cubre | `ROBO_PARCIAL.incluida=false`, `ROBO_AUTOPARTES.cubre=true` | `CONTENIDO_INCOHERENTE` |
| Cobertura nueva en el catálogo | 14.ª cobertura activa, planes sin fila | todos los planes pasan a incompletos |
| Comparar 4 planes | `ids` con 4 elementos | 400 `COMPARAR_MAXIMO_3` |

- `obtener-contenido-plan.use-case.ts` y `comparar-planes.use-case.ts` solo
  leen. Como el visitante sin cuenta no tiene JWT, el repositorio usa el
  cliente de servicio **solo para lecturas** de estas tablas (4.2); para
  usuarios autenticados las mismas filas se leen por RLS.
- `comparar-planes` devuelve las coberturas **en el mismo orden para todos los
  planes** (por `cobertura.orden`) para que el frontend pinte la matriz sin
  reordenar.
- `armar-copia-contenido.service.ts` agrega `congeladoEn` y verifica que el
  `planId` sea el de la prima elegida; si el contenido del plan está
  incompleto responde `CONTENIDO_PLAN_INCOMPLETO` (409) y **no crea la
  orden** (un plan incompleto no debería estar activo, pero se defiende).
- El contenido **no pasa por `sanitize-response`**: es información pública
  (RN-46). Las tarifas sí (3.4).
- Caché de 5 min en el repositorio, invalidada por `guardar-contenido-plan`.

### 3.7 `shared/`
Tipos compartidos; `WarningDto { code: 'ASEGURADORA_SIN_COTIZACION' |
'DATOS_COBERTURA_INCOMPLETOS' | 'PDF_EN_GENERACION' |
'SIMULACION_DESACTUALIZADA' | 'CONTENIDO_INCOHERENTE'; message: string }`.
Códigos de error nuevos del contenido: `COBERTURA_FALTANTE` y `CONTENIDO_INCOMPLETO` (400,
administración), `COMPARAR_MAXIMO_3` (400) y `CONTENIDO_PLAN_INCOMPLETO` (409, compra).

### 3.8 `supabase/`
Migraciones numeradas (doc contexto §9) y `config.toml` para
`supabase start` local. Los tipos se regeneran en CI después de migrar.

### 3.9 `test/`
- **Unit (Jest)**: dominio puro. Meta ≥ 70 % en dominio (RNF-16), ≥ 90 %
  en `motor-simulacion.ts` (RNF-22) y **100 % de ramas en las 5 estrategias de
  tarifa** (tabla de casos de 3.6.1) y en `validar-contenido-plan.ts` (tabla de 3.6.5).
- **Integration**: contra Supabase local. Casos obligatorios: RLS (un
  CLIENTE no ve cotizaciones ajenas; un ASESOR no ve pólizas), T1–T4,
  `uq_pago_confirmado_por_orden`, concurrencia en `tomar_solicitud` y
  `registrar_intento_contacto` (dos llamadas en paralelo → una falla); un
  CLIENTE y un ASESOR **no pueden leer** `peso_*`, `rango_suma_asegurada` ni
  `tarifa_plan`; `actualizar_suma_asegurada` rechaza una suma fuera de rango
  aunque el backend se salte la validación; el RPC rechaza el cambio de suma
  si ya existe `orden_compra`; `crear_orden_compra` rechaza `p_contenido_plan`
  nulo o de otro plan; editar el contenido de un plan **no cambia**
  `orden_compra.contenido_plan` de órdenes existentes; `admin_cambiar_estado_plan`
  rechaza activar un plan con contenido incompleto; un CLIENTE **no puede
  escribir** en `plan_cobertura`, `plan_exclusion` ni `plan_requisito`.
- **E2E**: CU-01 → Prueba de Choque → CU-02 completo hasta descargar PDF.

### 3.10 Raíz
`.env.example` sin valores reales; `package.json` con scripts `db:types`,
`test:unit`, `test:int`, `test:e2e`, `lint`.

---

## 4. Decisiones de diseño clave

### 4.1 Roles de negocio: no confiar en el JWT a ciegas
El JWT de Supabase trae `role: authenticated` (rol de Postgres), no
`ASESOR`. El rol de negocio vive en `svas.usuario.rol`; el trigger
`tg_usuario_sync_rol` lo copia a `auth.users.raw_app_meta_data.roles`
(firmado, no editable por el usuario). El backend lee
`app_metadata.roles` para decidir rápido **y** `roles.guard` confirma
`activo` en la tabla. Dentro de cada RPC, `svas.exigir_rol()` vuelve a
validar con `auth.uid()`: es la única barrera real porque `SECURITY
DEFINER` no está sujeto a RLS. `user_metadata` nunca se usa para
autorizar.

### 4.2 Dos clientes Supabase
- **Cliente de usuario** (`anon key` + JWT del usuario en el header): se
  crea por request; RLS y `auth.uid()` aplican. Se usa para todo lo que
  hace un usuario autenticado.
- **Cliente de servicio** (`service_role`): solo en `infrastructure/`,
  solo para los flujos públicos (cotizar, simular, ajustar la suma y retomar
  sin cuenta, donde el backend ya validó el token de cotización), para los
  jobs y para **leer las tarifas** (`TarifaSupabaseRepository`: las tablas
  `peso_*`, `rango_suma_asegurada` y `tarifa_plan` son secreto comercial, solo
  las lee `ADMINISTRADOR` por RLS, y el cálculo debe funcionar igual para el
  cliente anónimo) y, **solo en lectura**, el contenido comercial de los planes
  para el visitante sin sesión (`ContenidoPlanSupabaseRepository`). Una regla de ESLint (`no-restricted-imports`) impide
  importarlo desde `modules/*/presentation` o `domain`.

### 4.3 Operaciones atómicas multi-tabla vía RPC
`supabase-js` no ofrece transacciones entre varias llamadas `.from()`.
Todo lo que la Práctica 2 resolvía con "unidad de trabajo" (CU-02 pasos
5–7, CU-03 paso 6, CU-05) se resuelve con un RPC (doc contexto §6):

```sql
create or replace function svas.confirmar_compra(
  p_orden_id uuid, p_modo svas.modo_pago, p_numero_cuotas smallint,
  p_referencia varchar, p_numero_poliza varchar, p_monto_total numeric)
returns jsonb language plpgsql security definer
set search_path = svas, public as $$
declare v_orden svas.orden_compra; v_pago_id uuid; v_poliza_id uuid;
begin
  perform svas.exigir_rol(array['CLIENTE']);
  select * into v_orden from svas.orden_compra where id = p_orden_id for update;
  if not svas.es_duenio_cotizacion(v_orden.cotizacion_id) then
    raise exception 'No autorizado';
  end if;
  -- RN-38: contado = prima_final; en cuotas puede haber recargo (lo calcula la Estrategia en TS)
  if p_monto_total < v_orden.prima_final
     or (p_modo = 'UNICO' and p_monto_total <> v_orden.prima_final) then
    raise exception 'Monto total inválido para el modo de pago';
  end if;
  insert into svas.pago(orden_compra_id, monto, modo, estado, numero_cuotas, referencia)
    values (p_orden_id, p_monto_total, p_modo, 'CONFIRMADO', p_numero_cuotas, p_referencia)
    returning id into v_pago_id;             -- uq_pago_confirmado_por_orden evita doble cobro
  perform svas.generar_cuotas(v_pago_id);   -- si modo = CUOTAS
  v_poliza_id := gen_random_uuid();
  insert into svas.poliza(id, orden_compra_id, numero, archivo_pdf, canal_venta)
    values (v_poliza_id, p_orden_id, p_numero_poliza,
            'polizas/' || v_poliza_id || '.pdf', v_orden.canal_venta);   -- T4 valida pago
  update svas.cotizacion set estado = 'CONVERTIDA' where id = v_orden.cotizacion_id;
  update svas.seguimiento set estado = 'CONVERTIDO', fecha_cierre = now()
    where cotizacion_id = v_orden.cotizacion_id and estado = 'EN_SEGUIMIENTO';
  insert into svas.registro_actividad(usuario_id, accion, entidad, entidad_id)
    values (auth.uid(), 'CONFIRMAR_COMPRA', 'poliza', v_poliza_id);
  return jsonb_build_object('poliza_id', v_poliza_id,
                            'archivo_pdf', 'polizas/' || v_poliza_id || '.pdf');
end; $$;
revoke all on function svas.confirmar_compra from public, anon;
grant execute on function svas.confirmar_compra to authenticated;
```

> **Por qué `p_monto_total`**: el RPC no conoce las fórmulas de las
> aseguradoras (viven en TypeScript, RN-40). El backend calcula el total con
> `Estrategia.totalEnCuotas(prima_final, plan)` (en La Positiva incluye el
> recargo por fraccionar) y el RPC solo lo valida contra `prima_final`.

### 4.4 Flujo anónimo seguro (token de cotización)
El cliente de Segmento A/B cotiza sin cuenta (requisito del negocio:
sin fricción). El backend devuelve un `tokenAcceso` de 32 bytes, guarda
solo su SHA-256 y exige ese token en `X-Cotizacion-Token` para ver el
resumen o la Prueba de Choque. Al registrarse/iniciar sesión en el paso de
compra, `PATCH /cotizaciones/:id/cliente` vincula `cliente.usuario_id` y
desde ahí manda el JWT. El token expira con la cotización (deja de servir
cuando pasa a `CONVERTIDA`).

### 4.5 Integraciones simuladas detrás de puertos
```ts
export interface PasarelaPago {
  cobrar(i: { ordenId: string; monto: Decimal; modo: ModoPago; cuotas?: number;
              idempotencyKey: string }): Promise<{ estado: 'APROBADO' | 'RECHAZADO'; referencia: string }>;
}
export interface EmisionAseguradora {
  emitir(i: { codigoEstrategia: string; ordenId: string }): Promise<{ numeroPoliza: string }>;
}
```
`PasarelaSimulada` rechaza determinísticamente montos terminados en `.13`
(para poder probar el flujo de rechazo en E2E); el resto aprueba.

### 4.6 Rate limiting
Throttler con storage en memoria mientras haya una sola instancia en
Railway; `ThrottlerStorageRedisService` en cuanto se escale (variable
`REDIS_URL`). El perfil `publico` es más estricto porque es la superficie
expuesta sin login.

### 4.7 Dinero
`numeric(12,2)` en Postgres, `string` en JSON (nunca `number`), `Decimal`
en TypeScript. El frontend formatea, no calcula.

---

## 5. Cómo se resuelven los objetivos no negociables

| Objetivo | Dónde se resuelve |
|---|---|
| **Compra sin asesor (OE2)** | `compra` + `pagos` + `polizas`, RPC `confirmar_compra` |
| **Sin re-digitación (RNF-08)** | `campos-faltantes.policy.ts` devuelve solo lo no capturado |
| **Todo o nada (RNF-05)** | RPCs §6 doc contexto; `uq_pago_confirmado_por_orden`; T4 |
| **Control de acceso real (RNF-10)** | Guards + RLS + `exigir_rol()` dentro de cada RPC; tests de integración por rol |
| **Datos personales (RNF-11)** | DTO por rol con `mask.util`, perfil de simulación privado (RN-36), sin `ingreso` en reportes individuales |
| **Trazabilidad (RNF-12)** | `registro_actividad` escrito dentro del mismo RPC; append-only |
| **Extensibilidad (RNF-13, RNF-15)** | Strategy + puertos/adaptadores |
| **Tarifas explicables (OE1, RN-40, RN-41)** | Tablas de tarifa por aseguradora + una Estrategia pura por aseguradora + `detalle_calculo` en cada prima; doc de dominio §17 |
| **Transparencia (★ diferenciador)** | `prueba-choque` con instantánea (RN-32) y leyenda (RN-29) |
| **Disponibilidad 24/7 (RNF-04)** | Sin dependencia de asesor; `/health/ready` verifica Supabase |
| **Rendimiento (RNF-01, RNF-21)** | Estrategias en paralelo con timeout; reglas de simulación cacheadas |

---

## 6. Flujo completo de una request (ejemplo: confirmar compra)

```
POST /api/v1/compras/{ordenId}/pago
Authorization: Bearer <JWT CLIENTE>
Idempotency-Key: 5f0c…
{ "modo": "CUOTAS", "numeroCuotas": 6 }

1. correlation-id.middleware   → X-Correlation-Id
2. throttler                   → default
3. supabase-auth.guard         → user { id, roles:['CLIENTE'] }
4. roles.guard                 → @Roles('CLIENTE') ✓, usuario activo ✓
5. validation.pipe             → PagarDto (modo enum, 2 ≤ cuotas ≤ max_cuotas)
6. idempotency.interceptor     → si la key ya existe, devuelve la respuesta guardada
7. PagarYEmitirUseCase:
   a. lee orden (cliente de usuario → RLS: solo si es dueño)
   a'. monto = UNICO ? prima_final : Estrategia.totalEnCuotas(prima_final, plan)   (RN-38)
   b. PasarelaPago.cobrar({ monto, … }) → APROBADO / RECHAZADO
      └ RECHAZADO → RPC registrar_pago_rechazado → 400 "El pago fue rechazado"
   c. EmisionAseguradora.emitir(...)    → numeroPoliza
   d. RPC confirmar_compra(...)         → { poliza_id, archivo_pdf }   (todo o nada)
   e. GeneradorPdf.generar(poliza) → Storage   (fuera de la transacción)
      └ si falla: respuesta 201 con warning PDF_EN_GENERACION; el job lo regenera
8. sanitize-response.interceptor
9. 201 { compra: { estado:'CONFIRMADO', polizaId, cuotas:[…] }, warning? }
```

---

## 7. Orden de despliegue (pipeline CI/CD)

GitHub Actions en cada PR: `lint` → `test:unit` → `supabase start` +
migraciones → `test:int` → `test:e2e`. En `main`:

1. `supabase db push` contra el proyecto de producción (**migraciones
   antes que la app**; una migración que rompe compatibilidad se divide en
   dos despliegues).
2. `supabase gen types` y verificación de que no hay diff sin commitear.
3. Deploy a Railway (build `nest build`, start `node dist/main`).
4. Smoke test: `GET /api/v1/health/ready` = 200, `GET /catalogo/campos`
   devuelve 5 aseguradoras y `POST /cotizaciones` con el **caso dorado**
   (Toyota Corolla 2022, ubigeo 150122) devuelve las 10 primas disponibles
   (tabla 17.6 del doc de dominio).
5. Respaldo diario: workflow programado `pg_dump` → artefacto con
   retención 30 días (RNF-06, plan gratuito de Supabase no incluye PITR).

---

## 8. Convenciones de código y checklist por módulo

- Archivos en kebab-case; clases en PascalCase; nombres de dominio en
  español (coinciden con la base y con los documentos del curso); sufijos
  técnicos en inglés (`.use-case.ts`, `.controller.ts`, `.port.ts`).
- Un use-case por acción; el controller no tiene reglas.
- DTO de entrada con `class-validator`; DTO de salida explícito por rol
  (nunca se devuelve una fila cruda de Supabase).
- Los mensajes de error que ve el usuario están en español y salen del
  dominio o del RPC.

**Checklist por módulo nuevo**
- [ ] Migración con tablas + `enable row level security` + policies
      `SELECT/INSERT/UPDATE/DELETE` explícitas.
- [ ] RPCs con `exigir_rol()` en la primera línea y `revoke … from anon`.
- [ ] Dominio puro con tests unitarios antes del controller.
- [ ] Puerto + adaptador si toca algo externo.
- [ ] `@Roles()` en cada endpoint; `@Public()` solo si el doc de conexión
      lo marca público.
- [ ] DTO de respuesta revisado contra la tabla de campos sensibles.
- [ ] Test de integración de RLS (rol permitido ✓, rol no permitido ✗).
- [ ] Swagger con ejemplo de request/response y de error.
- [ ] Entrada en `registro_actividad` para acciones críticas.
- [ ] Si toca tarifas: caso nuevo en la tabla de pruebas de las estrategias,
      `parametrosSchema` actualizado y comprobación en el simulador de tarifa
      del admin.

### 8.1 DTO de respuesta con advertencia no bloqueante

```ts
export class CotizacionResponseDto {
  cotizacion: CotizacionDto;          // id, estado, opciones[], primas[]
  tokenAcceso?: string;               // solo en la creación anónima
  warning?: WarningDto;               // { code: 'ASEGURADORA_SIN_COTIZACION', message }
}
export class PruebaChoqueResponseDto {
  simulacion: SimulacionDto;          // ranking[], matriz[], peorCaso, leyenda
  warning?: WarningDto;               // { code: 'DATOS_COBERTURA_INCOMPLETOS', message }
}
```

---

## 9. Migraciones — tabla unificada

Remite a la sección 9 del documento de contexto (0001 a 0021). Asignación
por ola:

| Ola | Migraciones |
|---|---|
| Configuración inicial | 0001, 0002, 0003, 0019 |
| Ola 0 | 0004, **0005** (catálogo de vehículos y ubigeos), **0006** (tarifas), 0015 (solo RPCs de catálogo, parámetros y **tarifas**), 0016 |
| Ola 1 | 0007, 0008, 0012 (6.1 y 6.13), **0017** (seed de vehículos y tarifas) |
| Ola 2 | 0009, 0011, 0012 (6.2), 0014, 0015 (RPCs ★), 0018, **0020** (tablas y RPCs del contenido de planes; necesita `escenario_siniestro` de 0011), **0021** (seed del contenido; verifica RN-43 contra el seed 0018) |
| Ola 3 | 0010, 0013 |
| Ola 4 | vistas de reportes (nueva migración 0022 si se necesita) |

---

## 10. Instructivo de construcción: configuración inicial y orden por olas

### 10.1 Parte 1 — Configuración inicial (una sola vez, en `main`)

#### 10.1.1 Supabase
1. Crear el proyecto (plan free). Guardar `SUPABASE_URL`,
   `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`.
2. En *API settings*, exponer el esquema `svas` (requisito de
   `supabase-js`). Es seguro porque **todas** las tablas tienen RLS y
   `anon` no tiene grants; el frontend nunca llama a PostgREST, solo a Auth.
3. Correr 0001, 0002, 0003 y 0019.
4. Desactivar el registro público con confirmación de email solo en
   desarrollo; en producción, activar confirmación.
5. Crear el primer `ADMINISTRADOR` con un script (`scripts/crear-admin.ts`)
   que usa `service_role`.

#### 10.1.2 Repositorio y proyecto NestJS
1. `nest new svas-backend`, estructura de la sección 2.
2. `.env` local y variables en Railway.
3. Primer commit: boilerplate + `/health/live` y `/health/ready` en 200.

#### 10.1.3 `common/` completo
Guards, filtros, interceptores, pipe global, decoradores y `mask.util`
antes de cualquier módulo de negocio.

#### 10.1.4 `integracion/` vacío con puertos
Crear las interfaces de los 6 puertos y adaptadores que lancen
`NotImplementedException`. Así cada ola solo implementa lo suyo.

### 10.2 Parte 2 — Orden de construcción (por dependencia)

#### Ola 0 — Identidad y catálogo
- `modules/seguridad/` → login, registro, refresh, me, administración de
  usuarios.
- `modules/administracion/` (catálogo, parámetros y **tarifas**: tasas,
  pesos y rangos de suma) → depende de `seguridad`. Seed 0016 (catálogo) y,
  ya en Ola 1, el seed 0017 que carga los datos del Excel.

#### Ola 1 — Cotizar
- Seed 0017 (21 marcas, 68 modelos, 73 ubigeos, tarifas estimadas, RN-26) →
  `TarifaSupabaseRepository` → `EstrategiaBase` + las 5 clases, **una a la
  vez y cada una con su fila de la tabla de casos (3.6.1)**: Rímac (la más
  simple) → Mapfre (piso) → Qualitas (promedio) → La Positiva (tipo y recargo)
  → Pacífico (ubigeo y cargo fijo). Luego `modules/cotizacion/` (cotizar +
  ajustar suma + catálogo de vehículos). Al terminar: CU-01 funciona de
  punta a punta sin login y el caso dorado devuelve las 10 primas.

#### Ola 2 — Lo que se apoya en una cotización
Independientes entre sí, una rama cada uno:
- `modules/prueba-choque/` ★ (+ RPCs admin ★ y seed 0018).
- `modules/asesoria-retencion/` (cola, descuentos, seguimiento, detector,
  retoma, notificador simulado).
- `modules/planes/` ★ + `administracion/contenido-planes/` (migraciones 0020 y
  0021). Va **después** de la Prueba de Choque porque RN-43 amarra ambas fuentes
  y el seed 0021 se valida contra el 0018. Mientras no exista, el comparativo
  de la Ola 1 funciona igual: `resumen` llega `null` y la tarjeta no muestra
  "Ver detalle".

#### Ola 3 — Cerrar la venta
- `modules/pagos/` → `modules/polizas/` → `modules/compra/` (en ese
  orden dentro de la ola, porque `compra` orquesta a los otros dos).

#### Ola 4 — Medir
- `modules/reportes/` (incluye impacto de la Prueba de Choque) +
  mensaje de retención con resumen RN-35 + clasificador LLM opcional.

### 10.3 Resumen visual del orden

```
Config inicial ─► Ola 0: seguridad ─► administracion
                     │
                     ▼
                  Ola 1: integracion/estrategias + cotizacion
                     │
          ┌──────────┴───────────┐
          ▼                      ▼
   Ola 2: prueba-choque ★   Ola 2: asesoria-retencion
          │                      │
          └──────────┬───────────┘
                     ▼
          Ola 3: pagos → polizas → compra
                     │
                     ▼
          Ola 4: reportes + RN-35 + clasificador (opcional)
```

### 10.4 Checklist a repetir por cada módulo
Rama `feat/<modulo>` → migración → RPCs → dominio + tests → use-cases →
controller + DTOs + Swagger → tests de integración RLS → PR con CI verde →
merge a `main` → deploy.

---

## 11. Siguientes pasos recomendados

1. Validar con el negocio los valores de la Prueba de Choque (montos,
   probabilidades, deducibles por plan) usando los condicionados públicos de
   cada aseguradora; registrar la fuente en `cobertura_plan_escenario.fuente`.
   Hacer lo mismo con el contenido comercial de los planes (coberturas,
   exclusiones, requisitos): hoy es ilustrativo (RN-46).
2. Prueba de carga con datos sintéticos (k6) contra RNF-01/03/21 y revisar
   si el plan gratuito sostiene la meta.
3. Tokenizar `numero_documento` con Supabase Vault + HMAC para búsqueda si
   el proyecto pasa a datos reales.
4. Reemplazar `NotificadorSimulado` por WhatsApp Business API.
5. PWA con alerta de vencimiento de póliza (RF-33, backlog).
6. Reemplazar los datos **estimados** de tarifa (tasas, pesos, rangos) por los
   reales de cada aseguradora cuando se tenga acceso a sus tablas o a su API;
   solo cambia el seed o la clase `Estrategia…`, no el flujo de venta.
7. Pantalla de mantenimiento de marcas, modelos y tipos (hoy se cargan por
   seed 0017).

# Estado de la implementación — SVAS / SeguroSimple (backend)

> Documento de traspaso entre sesiones. Léelo junto con
> `contexto-dominio-seguro-simple.md` (manda en caso de conflicto) y
> `arquitectura-backend-seguro-simple.md` (orden de construcción en §10).
> Última actualización: 2026-11-11.

## 1. Dónde estamos

| Ola | Estado | Rama |
|---|---|---|
| Config inicial (§10.1) | ✅ hecho | en `main` |
| Ola 0 · `seguridad` | ✅ hecho y probado en Bruno | en `main` |
| Ola 0 · `administracion` (catálogo + tarifas) | ✅ hecho y probado en Bruno | en `main` |
| Ola 1 · `cotizacion` (parte 1: fórmulas, catálogo público, simulador) | ✅ hecho, **sin unir a main** | `feat/cotizacion` (subida a GitHub) |
| Ola 1 · `cotizacion` (parte 2: `POST /cotizaciones` y siguientes) | ⏳ **siguiente paso** | `feat/cotizacion` |

Tests al cierre: **140 unitarios + 18 e2e** en verde (`npm test`, `npm run test:e2e`).
El e2e verifica la tabla dorada §17.6 contra los datos reales de Supabase.

## 2. Siguiente paso concreto (Ola 1, parte 2)

1. Confirmar con el usuario que **Bruno → 04 / Simular Corolla 2022 (S 15000)** da 6 tests en verde.
2. Migraciones (todas nuevas; ver §4 sobre numeración):
   - `0007_clientes_vehiculos.sql` — `cliente`, `vehiculo` (con `modelo_id`), `ubicacion_uso` (con `ubigeo`) + RLS.
   - `0008_cotizaciones.sql` — `cotizacion` (con `token_acceso_hash`), `cotizacion_opcion`, `prima_cotizada` (suma, prima, prima_mensual, `detalle_calculo`) + RLS.
   - `solicitud_asesoria` (está en 0009 del doc): la necesita la derivación RN-01..04 al cotizar (motivo `INSPECCION` / `NO_ASEGURABLE`). Decidir si se adelanta la tabla o solo la parte necesaria.
   - `0012_rpc_cotizacion.sql` — RPC 6.1 `registrar_cotizacion`, 6.2, 6.13 `actualizar_suma_asegurada`.
3. Backend: `POST /cotizaciones` (público + token de acceso), `GET /cotizaciones/:id/resumen`,
   `PATCH /cotizaciones/:id/aseguradoras/:aseguradoraId/suma-asegurada`, `PATCH /cotizaciones/:id/cliente`,
   `GET /cotizaciones/mias`. Guard de token de cotización, `rpc.helper`, interceptor de idempotencia (doc backend).
   Validación RF-03 con `unirCampos()` ya existente, nicho RN-05, derivación RN-01..04.
4. Pendiente arrastrado de Ola 0: `POST /auth/registro` debe crear también `cliente` (con teléfono) y vincular `cotizacionId` (hoy solo crea `usuario`).
5. Agregar las peticiones nuevas a la colección Bruno (`svas-backend/bruno/`).
6. Al terminar: unir `feat/cotizacion` a `main` (`git merge --no-ff`) y subir.

Diferidos sin fecha: Swagger, `@nestjs/terminus` u Observe (no pedidos).

## 3. Qué existe (resumen por capa)

### Supabase (proyecto `wboemfsclwpzxsmodzct`, producción, esquema `svas`)
Migraciones **aplicadas**: 0001 enums · 0002 usuario + `rol_actual()` / `exigir_rol()` · 0003 registro_actividad ·
0004 catálogo · 0005 vehículos/ubigeos · 0006 tarifas + `v_tarifa_completitud` · 0015 RPCs admin catálogo ·
0016 seed catálogo · 0017 seed vehículos/tarifas · 0019 bucket `polizas` · 0022 RPCs usuarios · 0023 RPCs tarifas.

Datos: 5 aseguradoras, 10 planes, 22 campos, 15 reglas de inspección (solo `TRANSPORTE_PASAJEROS` exige), 21 marcas,
5 tipos, 68 modelos, 73 ubigeos, 10 `tarifa_plan`, 4 080 rangos, 583 pesos. 1 usuario ADMINISTRADOR.

Notas:
- Los 22 campos y 15 reglas del seed 0016 los **propuso Claude** (la "Práctica 2" no está en `docs/`).
- `0017` se **genera** con `python scripts/generar-seed-tarifas.py ../docs/base_vehiculos_aseguradoras.xlsx` (verifica consistencia del Excel).
- Dashboard: altas públicas OFF, anónimos OFF, esquema `svas` expuesto.

### Backend (`svas-backend/`, NestJS 12, Node 24)
- `common/`: guards `SupabaseAuthGuard` (JWKS ES256) y `RolesGuard` (revalida rol/activo en BD, caché 60 s), filtro de errores único
  `{statusCode,message,errors?,correlationId,timestamp,path}`, traducción de errores Postgres, pipe de validación, interceptores, utils (dinero con decimal.js).
- `modules/seguridad`: `POST /auth/registro`, `GET /usuarios/me`, `/admin/usuarios` (listar, crear interno, rol, estado). Login/refresh los hace el frontend con supabase-js.
- `modules/administracion`: `/admin/{panel, aseguradoras, planes, campos, reglas-inspeccion, parametros, bitacora}` y
  `/admin/tarifas/{planes, pesos/:tabla, rangos-suma, completitud, simular}`. Guardar tarifas invalida el caché de tarifas.
- `modules/cotizacion`: `GET /catalogo/{campos, vehiculos/marcas, …/modelos, …/anios, ubigeos/*}` (públicos),
  `TarifaSupabaseRepository` (service_role, caché 5 min), `CalculadoraPrimasService` (paralelo, timeout 2 s, RF-05), `unirCampos()` (RN-17).
- `integracion/estrategias`: `EstrategiaBase` + Rímac, Pacífico, La Positiva, Mapfre, Qualitas (§17.5), con `parametrosSchema` (zod),
  `pesosRequeridos` / `pesosOpcionales`. Resto de adaptadores (pagos, emisión, PDF, notificador, clasificador): stubs `NotImplemented`.

### Scripts (`svas-backend/`)
`npm run verificar-env` · `npm run crear-admin -- --email X --nombre "Y"` · `npm run cambiar-password -- --email X` ·
`python scripts/generar-seed-tarifas.py <xlsx>`.

### Bruno (`svas-backend/bruno/`)
Credenciales en `bruno/.env` (ignorado). `.env.example` **siempre vacío**. Carpetas: 01 Auth · 02 Salud · 03 Catálogo admin ·
04 Tarifas admin (incluye simulaciones del caso dorado) · 05 Catálogo público.

## 4. Convenciones que hay que respetar

- **Migraciones**: nunca editar una aplicada. Como ya hay aplicadas con números altos (0015–0023), las nuevas de número
  menor se aplican con `npx supabase db push --remote --include-all` (desde `svas-backend/`). Probar antes dentro de
  `begin … rollback` con `npx supabase@3.1.0 db query --remote --yes -f archivo.sql` (**pedir permiso al usuario**; es producción).
  Verificaciones con `--read-only` no necesitan permiso.
- **RPC**: `SECURITY DEFINER`, `set search_path = svas, public`, primera línea `perform svas.exigir_rol(...)`,
  bitácora antes/después en la misma transacción, `revoke … from public, anon` + `grant … to authenticated` **explícitos**.
  Errores: `P0001` → 400 (mensaje al usuario), `P0002` → 404, `42501` → 403, `23505` → 409.
- **RLS**: catálogo lectura para `authenticated` (admin ve inactivos); tarifas solo ADMINISTRADOR; usar `(select svas.rol_actual())`.
- **Clientes Supabase**: de usuario (anon key + JWT → RLS) para lo autenticado; de servicio solo para flujos públicos, tarifas y jobs.
- **Capas**: puertos en `modules/*/domain` con token `Symbol`, adaptadores en `infrastructure/` o `integracion/`.
  Fórmulas solo en las Estrategias (RN-40), nunca en SQL ni frontend.
- **Dinero/pesos/tasas** como string decimal en JSON (`"640.40"`, `"0.950"`, `"0.0420"`); redondeo half-up con decimal.js.
- **Mensajes** de validación en español; DTOs con class-validator; `parametros` de tarifa con el zod de cada Estrategia.
- **Git**: rama por módulo (`feat/<modulo>`), commits con `Co-Authored-By`, merge `--no-ff` a `main`. Repo **público**:
  `git add` por ruta explícita y revisar `git diff --cached` antes de cada commit (ya se filtró una contraseña por
  `bruno/.env.example`; se rotó). Hay un commit viejo en `feat/cotizacion` con esa contraseña ya inválida; reescribirlo requiere force push y autorización del usuario.
- **Usuario**: prefiere instrucciones muy simples, paso a paso, con rutas exactas y una sola terminal. No pedirle contraseñas ni tokens en el chat.

## 5. Comandos útiles

```powershell
cd C:\Users\Charlie\Desktop\Office\svas\svas-backend
npm run start:dev          # backend en http://localhost:3000/api/v1
npm test                   # unitarios
npm run test:e2e           # e2e contra Supabase real
npx tsc --noEmit -p tsconfig.json; npx oxlint src test
npx supabase db push --remote --dry-run --include-all
```

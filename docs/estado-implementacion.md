# Estado de la implementación — SVAS / SeguroSimple (backend)

> Documento de traspaso entre sesiones. Léelo junto con
> `contexto-dominio-seguro-simple.md` (manda en caso de conflicto) y
> `arquitectura-backend-seguro-simple.md` (orden de construcción en §10).
> Última actualización: 2026-11-11 (Ola 1 parte 2).

## 1. Dónde estamos

| Ola | Estado | Rama |
|---|---|---|
| Config inicial (§10.1) | ✅ hecho | en `main` |
| Ola 0 · `seguridad` | ✅ hecho y probado en Bruno | en `main` |
| Ola 0 · `administracion` (catálogo + tarifas) | ✅ hecho y probado en Bruno | en `main` |
| Ola 1 · `cotizacion` (parte 1: fórmulas, catálogo público, simulador) | ✅ hecho | en `main` |
| Ola 1 · `cotizacion` (parte 2: clientes, cotizaciones, RPC, endpoints) | ✅ hecho, migraciones **aplicadas**; falta Bruno 06 + commit | `feat/cotizacion` |

Tests al cierre: **180 unitarios + 26 e2e** en verde (`npm test`, `npm run test:e2e`).
El e2e verifica la tabla dorada §17.6 contra los datos reales de Supabase. Los e2e de
cotizaciones solo prueban errores (no escriben en la base); el camino feliz se prueba con Bruno 06.

## 2. Siguiente paso concreto

1. Usuario: correr **Bruno → 06 Cotizaciones** en orden (crea una cotización real de prueba
   con `prueba.bruno@example.com`). Esperado: Cotizar 7 ✅, Resumen 4 ✅, Ajustar 5 ✅, errores 400/401/403.
2. Commit en `feat/cotizacion` (revisar `git diff --cached`), merge `--no-ff` a `main` y subir.
3. Ola 2 (doc backend §10.2): `asesoria-retencion` (seguimiento, intento_contacto, descuento, T2 →
   migración nueva con número > 0023), `prueba-choque` (0011 + 6.2 `registrar_simulacion`), contenido de planes (0020/0021).
4. Al crear `orden_compra` (0010) y `simulacion` (0011): `create or replace` de `actualizar_suma_asegurada`
   para rechazar si hay orden y marcar `simulacion.vigente = false` (hoy devuelve `simulaciones_invalidadas = 0`).
   Al crear `seguimiento`: sumar su rama a `puede_ver_cotizacion` / `puede_ver_cliente`.

Diferidos sin fecha: Swagger, `@nestjs/terminus` u Observe (no pedidos). Interceptor de idempotencia:
recién hace falta en `POST /compras/:id/pago` (Ola 3); existe `@nestjs/idempotency`.

## 3. Qué existe (resumen por capa)

### Supabase (proyecto `wboemfsclwpzxsmodzct`, producción, esquema `svas`)
Migraciones **aplicadas**: 0001 enums · 0002 usuario + `rol_actual()` / `exigir_rol()` · 0003 registro_actividad ·
0004 catálogo · 0005 vehículos/ubigeos · 0006 tarifas + `v_tarifa_completitud` · 0007 cliente/vehiculo/ubicacion_uso ·
0008 cotizacion/opcion/prima_cotizada · 0009 `solicitud_asesoria` (completa, adelantada) + T1 · 0012 RPCs cotización ·
0015 RPCs admin catálogo · 0016 seed catálogo · 0017 seed vehículos/tarifas · 0019 bucket `polizas` · 0022 RPCs usuarios ·
0023 RPCs tarifas.

Decisiones propias de Ola 1 parte 2 (no estaban en `docs/`; revisables):
- Checks de `cliente`: DNI 8 dígitos o CE/pasaporte 9–12 alfanuméricos; celular `^9\d{8}$`.
- T1 = "`asesor_id` es un ASESOR activo" (`fn_validar_asesor`, reutilizable).
- Una sola `solicitud_asesoria` abierta por cotización (índice único parcial).
- Sin cuenta, el cliente se reutiliza por email + teléfono **solo** si no tiene `usuario_id`.
- RN-05 cuenta vehículos ya asegurados (cotización `CONVERTIDA`), no cotizaciones.
- Columnas que `authenticated` nunca lee (grant por columna): `cotizacion.token_acceso_hash`, `prima_cotizada.detalle_calculo`.
- `vincular_cliente` exige el hash del token si la cotización aún es anónima; `registrar_usuario_cliente` hace usuario + cliente + vínculo atómicos.
- 6.2 `registrar_simulacion` diferido a 0011.

Datos: 5 aseguradoras, 10 planes, 22 campos, 15 reglas de inspección (solo `TRANSPORTE_PASAJEROS` exige), 21 marcas,
5 tipos, 68 modelos, 73 ubigeos, 10 `tarifa_plan`, 4 080 rangos, 583 pesos. 1 usuario ADMINISTRADOR.

Notas:
- Los 22 campos y 15 reglas del seed 0016 los **propuso Claude** (la "Práctica 2" no está en `docs/`).
- `0017` se **genera** con `python scripts/generar-seed-tarifas.py ../docs/base_vehiculos_aseguradoras.xlsx` (verifica consistencia del Excel).
- Dashboard: altas públicas OFF, anónimos OFF, esquema `svas` expuesto.

### Backend (`svas-backend/`, NestJS 12, Node 24)
- `common/`: guards `SupabaseAuthGuard` (JWKS ES256) y `RolesGuard` (revalida rol/activo en BD, caché 60 s), filtro de errores único
  `{statusCode,message,errors?,correlationId,timestamp,path}`, traducción de errores Postgres, pipe de validación, interceptores, utils (dinero con decimal.js).
- `modules/seguridad`: `POST /auth/registro` (crea usuario + cliente y vincula `cotizacionId` con `X-Cotizacion-Token`), `GET /usuarios/me`, `/admin/usuarios` (listar, crear interno, rol, estado). Login/refresh los hace el frontend con supabase-js.
- `common/`: además `@AuthOpcional()` (JWT opcional, lo respetan ambos guards globales); `infrastructure/database/rpc.helper.ts`.
- `modules/administracion`: `/admin/{panel, aseguradoras, planes, campos, reglas-inspeccion, parametros, bitacora}` y
  `/admin/tarifas/{planes, pesos/:tabla, rangos-suma, completitud, simular}`. Guardar tarifas invalida el caché de tarifas.
- `modules/cotizacion`: `GET /catalogo/{campos, vehiculos/marcas, …/modelos, …/anios, ubigeos/*}` (públicos),
  `TarifaSupabaseRepository` (service_role, caché 5 min), `CalculadoraPrimasService` (paralelo, timeout 2 s, RF-05), `unirCampos()` (RN-17).
  `/cotizaciones`: `POST` (público, 20/min), `GET :id/resumen` y `PATCH :id/aseguradoras/:aseguradoraId/suma-asegurada`
  (Bearer o `X-Cotizacion-Token`, vía `CotizacionAccesoGuard`), `PATCH :id/cliente` y `GET mias` (CLIENTE).
  Dominio puro en `domain/cotizacion.ts`: `decidirDerivacion` (RN-01..04), `verificarNicho` (RN-05), `validarContraCatalogo` (RF-03).
- `integracion/estrategias`: `EstrategiaBase` + Rímac, Pacífico, La Positiva, Mapfre, Qualitas (§17.5), con `parametrosSchema` (zod),
  `pesosRequeridos` / `pesosOpcionales`. Resto de adaptadores (pagos, emisión, PDF, notificador, clasificador): stubs `NotImplemented`.

### Scripts (`svas-backend/`)
`npm run verificar-env` · `npm run crear-admin -- --email X --nombre "Y"` · `npm run cambiar-password -- --email X` ·
`python scripts/generar-seed-tarifas.py <xlsx>`.

### Bruno (`svas-backend/bruno/`)
Credenciales en `bruno/.env` (ignorado). `.env.example` **siempre vacío**. Carpetas: 01 Auth · 02 Salud · 03 Catálogo admin ·
04 Tarifas admin (incluye simulaciones del caso dorado) · 05 Catálogo público · 06 Cotizaciones (guarda solas
`cotizacionId`, `tokenAcceso`, `rimacId`).

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

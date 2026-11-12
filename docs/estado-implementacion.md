# Estado de la implementación — SVAS / SeguroSimple (backend)

> Documento de traspaso entre sesiones. Léelo junto con
> `contexto-dominio-seguro-simple.md` (manda en caso de conflicto) y
> `arquitectura-backend-seguro-simple.md` (orden de construcción en §10).
> Última actualización: 2026-11-12 (Ola 4, tanda 2: PDF y RN-35).

## 1. Dónde estamos

| Ola | Estado | Rama |
|---|---|---|
| Config inicial (§10.1) | ✅ hecho | en `main` |
| Ola 0 · `seguridad` | ✅ hecho y probado en Bruno | en `main` |
| Ola 0 · `administracion` (catálogo + tarifas) | ✅ hecho y probado en Bruno | en `main` |
| Ola 1 · `cotizacion` (partes 1 y 2) | ✅ hecho y probado en Bruno | en `main` |
| Ola 2 · `asesoria-retencion` | ✅ hecho y probado en Bruno (07: 01–15; 16–18 esperan un seguimiento) | en `main` |
| Ola 2 · `prueba-choque` tanda 1 (motor + endpoints) | ✅ hecho y probado en Bruno (08: 01–09), 0026–0028 **aplicadas** | en `main` |
| Ola 2 · `prueba-choque` tanda 2 (admin del catálogo) | ✅ hecho y probado en Bruno (09: 01–14), 0029 **aplicada** | en `main` |
| Ola 2 · contenido de planes (`planes`) | ✅ hecho y probado en Bruno (10: 01–11), 0030–0032 **aplicadas** | en `main` |
| Ola 3 · tanda 1 (base de compra + `pagos`) | ✅ hecho; 0033–0034 **aplicadas**; regresión en Bruno 06 y 08 ✅ | en `main` |
| Ola 3 · tanda 2 (`polizas`) | ✅ hecho y probado en Bruno (11: 01–05) | en `main` |
| Ola 3 · tanda 3 (`compra`) | ✅ hecho y probado en Bruno (12: 01–16), 0035 **aplicada** | en `main` |
| Ola 4 · tanda 1 (`reportes` JSON) | ✅ hecho y probado en Bruno (13: 01–12), 0036 **aplicada** | en `main` |
| Ola 4 · tanda 2 (PDF + RN-35) | ✅ hecho y probado en Bruno (08/10, 13/05, 13/13), 0037 **aplicada** | en `main` |

Tests al cierre: **390 unitarios + 78 e2e** en verde (`npm test`, `npm run test:e2e`).
El e2e verifica la tabla dorada §17.6 contra los datos reales de Supabase. Los e2e de
cotizaciones, asesoría y prueba de choque solo prueban errores y lecturas públicas (no escriben en la base);
el camino feliz se prueba con Bruno 06, 07, 08 y 09.
Las RPC de 0025 (41 casos), 0028 (15 casos), 0029 (36 casos), 0030–0031 (27 casos), 0032 (5 casos), 0033–0034 (25 casos), 0035 (18 casos), 0036 (16 casos) y 0037 (8 casos) se probaron dentro de `begin … rollback` antes de aplicarlas.

### Último cierre (2026-11-12): Ola 4, tanda 2 (PDF + RN-35)

`feat/reportes-pdf` mergeada en `main` (`--no-ff`) y subida. 0037 se probó con `begin … rollback` (8 casos) y se
aplicó. Bruno en verde: 08/10 (Resumen en PDF; requiere correr antes 02 y 03 para `cotChoqueId`/`tokenChoque`),
13/05 (ya trae `conversionMensajeRn35`; en 0 hasta que salga un mensaje final real) y 13/13 (Ventas en PDF).

Recordatorio: borrar el repo `svas-viejo` y los respaldos `svas-respaldo-2026-11-12*.bundle`
(todavía tienen la contraseña filtrada).

### Cierre anterior (2026-11-12): Prueba de Choque, tanda 2 (admin del catálogo)

`feat/prueba-choque-admin` ya está mergeada en `main` (`--no-ff`) y subida. 0029 se probó con `begin … rollback`
(36 casos) y se aplicó; Bruno 09 pasó de la 01 a la 14. `coverage/` y `*.tsbuildinfo` ahora están en el `.gitignore`
y `tsconfig.build.tsbuildinfo` dejó de estar versionado.

Ola 2 completa (parte 3 en `main`; 0030–0032 aplicadas; Bruno 10: 01–11). El historial se reescribió el
2026-11-12 para quitar "Co-Authored-By: Claude" (force push de `main` y `feat/*`; respaldo en
`svas-respaldo-2026-11-12.bundle`, junto a la carpeta del repo).

## 2. Siguiente paso concreto

1. **Ola 3 — cerrar la venta** (arquitectura backend §10.2): `pagos` → `polizas` → `compra`.
   - Tanda 1: ✅ 0033 tablas + T3/T4 + RLS; ✅ 0034 RPCs de compra,
     `actualizar_suma_asegurada` v3 (409 si hay orden) y detector v2 ("sin orden"); ✅ módulo `pagos`
     (pasarela simulada + `ProcesarPagoService`). Bruno 06 y 08 en verde (regresión del ajuste de suma);
     mergeada en `main`.
   - Tanda 2 `polizas`: ✅ emisión simulada (PREFIJO-AÑO-8 hex, idempotente por orden);
     ✅ PDF con PDFKit 0.20.2 desde `orden_compra.contenido_plan`, leyenda RNF-20 arriba y en el pie de
     cada página; ✅ subida a Storage + `pdf_generado_en`; ✅ `GET /polizas/mias` y `GET /polizas/:id/pdf`
     (200 PDF o 202 + `PDF_EN_GENERACION`); ✅ job cada 5 min; ✅ Bruno 11 (01–05); mergeada en `main`.
     La subida real a Storage y el PDF de una póliza real se prueban en la tanda 3 (aún no hay compras).
     Decisiones: el backend entrega el archivo (doc conexión §7) en vez de una URL firmada; `GeneradorPdf`
     solo dibuja (devuelve Buffer) y el repositorio sube a Storage con la clave `<id>.pdf` dentro del
     bucket `polizas`; si el PDF falta al descargar, se intenta generar una vez antes de responder 202.
   - Tanda 3 `compra`: ✅ resumen, campos faltantes, datos, `POST /compras` (con `ArmarCopiaContenidoService`,
     RN-45), `POST /compras/:id/pago` (+ `Idempotency-Key`), estado; ✅ 22 pruebas unitarias + 6 e2e (401);
     ✅ 0035 probada con rollback (18 casos) y aplicada; ✅ Bruno 12 (01–16) con el flujo completo en producción
     (compra real del cliente de prueba: pago en 6 cuotas, idempotencia, póliza, subida a Storage y descarga del PDF).
     **Ola 3 cerrada.**
     El rechazo (total terminado en .13) lo cubren las pruebas unitarias.
2. Ola 4 — medir:
   - Tanda 1 `reportes`: ✅ ventas (canal/aseguradora/plan), retención, descuentos, ★ impacto de la Prueba de Choque
     y mi desempeño del asesor (JSON); ✅ 0036 probada con rollback (16 casos) y aplicada; ✅ Bruno 13 (01–12).
   - Tanda 2: ✅ PDF del reporte de ventas (`?formato=pdf`), ✅ PDF de la simulación
     (`GET /cotizaciones/:id/prueba-choque/pdf`), ✅ frase RN-35 en el mensaje final y su cruce en el reporte
     de la Prueba de Choque (`conversionMensajeRn35`); ✅ 0037 probada con rollback (8 casos) y aplicada;
     ✅ Bruno 08/10, 13/05 y 13/13.
   - Más adelante (pospuesto por el usuario): clasificador de preocupaciones (palabras clave y, opcional, LLM).
3. **Despliegue en Railway** (rama `chore/deploy`): ✅ `engines.node` 24.x, ✅ guía `docs/despliegue.md`
   (configuración por panel, no `railway.json`: Railway lo deja de leer el 2026-12-01), ✅ entorno Bruno `Railway`;
   ✅ build de producción probado en local (`ready` 200). Falta: crear el servicio en Railway (usuario) y el smoke test.
   Pasarela, emisión y mensajes quedan simulados a propósito (proyecto de prueba).
4. Bruno 07 16–18 cuando exista un seguimiento abierto (el detector corre a cada hora en punto con el backend encendido).
5. Pendiente sin fecha de §18.10: alerta diaria de planes incompletos o con contenido de más de 180 días.

Diferidos sin fecha: Swagger, `@nestjs/terminus` u Observe (no pedidos).

## 3. Qué existe (resumen por capa)

### Supabase (proyecto `wboemfsclwpzxsmodzct`, producción, esquema `svas`)
Migraciones **aplicadas**: 0001 enums · 0002 usuario + `rol_actual()` / `exigir_rol()` · 0003 registro_actividad ·
0004 catálogo · 0005 vehículos/ubigeos · 0006 tarifas + `v_tarifa_completitud` · 0007 cliente/vehiculo/ubicacion_uso ·
0008 cotizacion/opcion/prima_cotizada · 0009 `solicitud_asesoria` (completa, adelantada) + T1 · 0012 RPCs cotización ·
0015 RPCs admin catálogo · 0016 seed catálogo · 0017 seed vehículos/tarifas · 0019 bucket `polizas` · 0022 RPCs usuarios ·
0023 RPCs tarifas · 0024 seguimiento/intento_contacto/descuento + T2 · 0025 RPCs asesoría y retención ·
0026 tablas Prueba de Choque · 0027 seed Prueba de Choque · 0028 `registrar_simulacion` + `actualizar_suma_asegurada` v2.
0029 RPCs admin de la Prueba de Choque · 0030 contenido de planes · 0031 seed del contenido (§18) · 0032 arreglo: la vista de completitud daba 403 (permiso de `fn_incoherencias_plan`) (**aplicadas** 2026-11-12).
0033 orden_compra/pago/cuota/poliza + T3/T4 · 0034 RPCs de compra + `actualizar_suma_asegurada` v3 + detector v2 (**aplicadas** 2026-11-12).
0035 `completar_datos_compra` + `vista_previa_descuento` (**aplicada** 2026-11-12).
0036 RPCs de reportes (**aplicada** 2026-11-12).
0037 `seguimiento.mensaje_final_en/_rn35` + `registrar_mensaje_final` + `reporte_prueba_choque` v2 (**aplicada** 2026-11-12).

Decisiones propias de Ola 4 tanda 2 (PDF, RN-35 y 0037, revisables):
- Frase RN-35: de la última simulación **vigente** con 2+ planes. Plan más barato = menor prima (CRA − esperado,
  empate por ranking); se elige el escenario y el otro plan con la mayor diferencia de desembolso a favor del otro
  (sin contar escenarios sin dato). Si el barato nunca sale peor, no hay frase.
- La frase se arma al enviar; si falla, el mensaje sale igual sin ella. Solo se registra (`registrar_mensaje_final`,
  service_role) cuando el notificador confirma el envío; reenviar reemplaza el registro.
- `conversionMensajeRn35` = seguimientos de la cohorte del reporte con mensaje final enviado, con y sin frase;
  "compra" = la cotización terminó CONVERTIDA.
- PDF de la simulación: 1 página con ranking, zona, contraste y leyenda RN-29; sin datos del perfil (RN-36).
  Mismo acceso que la simulación (JWT del dueño o `X-Cotizacion-Token`).
- PDF solo para ventas (RF-30); los demás reportes siguen en JSON.

Decisiones propias de Ola 4 tanda 1 (`reportes` y 0036, revisables):
- Funciones con el rol exigido dentro (no vistas). Periodo en días de Lima, extremos incluidos, máximo 366 días;
  sin `?desde=&hasta=` el backend usa el mes en curso.
- Ventas = pólizas emitidas en el periodo con su pago confirmado; aseguradora y plan salen de la copia congelada
  de la orden (nombre del momento de la venta). `participacion` = % de la prima final.
- Retención = cohorte de seguimientos abiertos en el periodo, con su estado actual.
- Descuentos negociados = otorgados en el periodo; "convertido" si su orden terminó en póliza.
- Prueba de Choque = cotizaciones creadas en el periodo, con su última simulación; además del "plan distinto al
  más barato" se informa cuántos eligieron el #1 del ranking.
- Mi desempeño: venta atribuida al asesor si lleva su descuento negociado o es TELEMARKETING con un ACEPTA suyo.
- Ningún reporte expone el ingreso diario del perfil (RN-36).

Decisiones propias de Ola 3 tanda 3 (`compra` y 0035, revisables):
- Los datos faltantes (documento y placa) se guardan con `PUT /compras/:cotizacionId/datos`; `POST /compras` envía
  `p_datos_faltantes = null`. Un dato ya guardado no se cambia (400) y, creada la orden, quedan fijos (409).
  El documento vuelve enmascarado.
- `GET /compras/resumen` muestra el descuento con `vista_previa_descuento` (mismas reglas que `crear_orden_compra`;
  si se cambia una, hay que cambiar la otra) con `provisional: true` si el cliente aún no dio su documento.
  Si ya hay orden, usa sus montos congelados; si la orden es de otro plan, 409. `pago.CUOTAS` usa `max_cuotas`
  (leído con service_role: `parametros_comerciales` no es visible para CLIENTE) y añade `pago.maxCuotas`.
- `ArmarCopiaContenidoService` (en `planes`) lee el contenido sin caché y responde 409 `CONTENIDO_PLAN_INCOMPLETO`.
- `POST /compras` y `GET /compras/:id/estado` devuelven la misma vista de la orden (`estado` PENDIENTE_PAGO o
  CONFIRMADO, montos, pago confirmado con cuotas, `pagosRechazados`, póliza y `contenidoPlan`).
- Idempotencia de `POST /compras/:id/pago` sin `@nestjs/idempotency` ni memoria: se cobra con la clave (la pasarela
  devuelve la misma referencia) y, si la orden ya tiene un pago con esa referencia, se responde lo mismo (201 o el
  mismo 400). Carreras: PT409/23505 en `confirmar_compra` → se relee la orden. **Limitación**: con una pasarela real,
  otra clave sobre una orden ya pagada llegaría a cobrar antes del 409; al conectarla, guardar la clave en `pago`.
- `Idempotency-Key` obligatoria: 8 a 100 caracteres `[A-Za-z0-9_.:-]`.

Decisiones propias de Ola 3 tanda 1 (0033/0034, revisables):
- Lo que el doc ubicaba en 0010/0013 va en 0033/0034.
- `orden_compra` guarda además `prima_anual`, `descuento_id/tipo/porcentaje`; `poliza.pdf_generado_en` (null = PDF pendiente).
- `crear_orden_compra` recibe además `p_acepta_condiciones` y `p_firma_simulada`; solo CLIENTE dueño
  (la compra exige cuenta, también después de la retoma).
- Canal (RN-27) por evidencia en la base: enlace de retoma usado o intento `ACEPTA` → TELEMARKETING;
  descuento negociado aplicado → ASESORIA; si no, AUTONOMO. `p_origen` solo acepta null o `RETOMA` y va a la bitácora.
- RN-09: entre el negociado aceptado (del mismo plan) y el de primera compra queda el mayor; empate → negociado.
- Rechaza con 409 si el plan no tiene resumen o le falta alguna cobertura activa (`CONTENIDO_PLAN_INCOMPLETO`).
- En CUOTAS la cuota 1 queda CONFIRMADO y las demás PENDIENTE, una por mes (fecha de Lima); la última absorbe el redondeo.
- `actualizar_suma_asegurada` v3: la cotización CONVERTIDA también responde 409 (antes 400 desde el RPC; el backend ya daba 409).
- Pasarela simulada: rechaza totales terminados en .13; la referencia es `SIM-` + sha256(ordenId:idempotencyKey), sin estado en memoria.

Decisiones propias de Ola 2 parte 3 (0030/0031, revisables):
- Lo que el doc ubicaba en 0020/0021 va en 0030/0031. Las descripciones de las 13 coberturas las propuso Claude.
- 0031 **alinea la Prueba de Choque con §18.5** (el doc manda): tope de RC de `DANO_TERCEROS` = límite de RC del plan
  (antes 30 000 / 50 000) y días de reemplazo de Pacífico Premium 15 y La Positiva Full 20 (antes 10 y 7). No cambia
  ningún resultado del motor hoy (el daño a terceros es 2 500) y deja una fila `ALINEAR_PRUEBA_CHOQUE_CONTENIDO` en la bitácora.
- RN-43 tiene una sola definición en SQL: `fn_incoherencias_plan` (interna; la usan la vista y los RPC). Un escenario sin
  fila en `cobertura_plan_escenario` no cuenta como "cubre". En TS solo se validan los errores (RN-42) antes del RPC.
- `v_plan_contenido_completitud` incluye también los planes inactivos (para revisar antes de activar) y filtra por rol
  (solo ADMINISTRADOR ve filas). `admin_cambiar_estado_plan` v2 rechaza activar con el detalle de lo que falta.
- Coberturas del catálogo: `PUT /admin/coberturas/:codigo` crea o reemplaza (el doc decía `POST` + `PUT /:id`), con la
  lista `escenarios` (cobertura_escenario) y devuelve `planesSinDefinir`.
- Público: `GET /planes/:planId/contenido` responde 404 si el plan no está activo o aún no tiene `resumen`.
  El contenido se lee con service_role y se guarda 5 min; lo invalidan el admin del contenido y los cambios de planes o aseguradoras.
- `resumen` de cada prima en cotizaciones sale de ese mismo caché (puerto `RESUMEN_PLANES`); si falla, queda null y la cotización sigue.
- `ArmarCopiaContenidoService` (RN-45) queda para la Ola 3, junto con `orden_compra`.

Decisiones propias de Ola 2 parte 2, tanda 2 (0029, revisables):
- RPC `admin_guardar_escenario(codigo, payload)` (crea o reemplaza; debe quedar ≥ 1 activo) y cargas por lote
  `admin_guardar_{coberturas, frecuencias, zonas, factores}(p_filas)` → `{recibidas, cambiadas, total}`. El doc las
  nombra en singular. En las filas el escenario va por **código**. No borran filas (zona MEDIA = sin fila; factor 1,00 = sin efecto).
- Bitácora solo con lo que cambió (`GUARDAR_ESCENARIO`/`CREAR_ESCENARIO`, `GUARDAR_COBERTURAS_CHOQUE`,
  `GUARDAR_FRECUENCIAS_CHOQUE`, `GUARDAR_ZONAS_RIESGO`, `GUARDAR_FACTORES_PERFIL`), con antes/después.
- Probabilidad base hasta 0,95 (el mismo techo del motor). El catálogo no tiene caché: un cambio vale desde la
  siguiente simulación; las guardadas no cambian (RN-32).
- `GET /admin/prueba-choque/escenarios` trae `pendientes` por escenario activo (uso × zona sin frecuencia → el motor
  usa 0; planes activos sin cobertura → "Sin información").

Decisiones propias de Ola 2 parte 2 (revisables):
- Lo que el doc ubicaba en 0011/0018 va en 0026/0027/0028. Todos los valores del seed 0027 son **supuestos referenciales**
  propuestos por Claude (RN-31): 6 escenarios, 60 coberturas, 54 frecuencias, 50 distritos de Lima/Callao con zona
  (el resto cae en MEDIA), 9 factores de perfil.
- El motor es una función pura (`prueba-choque/domain/motor-simulacion.ts`); el RPC solo valida y guarda la instantánea.
  `version_reglas` = 12 primeros hex del sha256 del catálogo usado.
- `registrar_simulacion` acepta service_role o el CLIENTE dueño; solo cotizaciones `REGISTRADA`; los planes deben ser
  exactamente las primas disponibles. `actualizar_suma_asegurada` marca `vigente = false` y el RPC devuelve `simulaciones_invalidadas` (también en la bitácora).
- `simulacion.perfil` no se expone nunca (grant por columna, RN-36); el ingreso diario solo se guarda en uso comercial (RN-33).
- La respuesta se arma solo desde la instantánea; `prima = costoRealAnual − desembolsoEsperado` (los sin dato no suman, RN-30).
  Si faltan datos, `warning: DATOS_COBERTURA_INCOMPLETOS`.

Decisiones propias de Ola 2 parte 1 (revisables):
- Lo que el doc ubicaba en 0009/0014 va en 0024/0025 (las de número bajo ya estaban aplicadas).
- `seguimiento.enlace_usado_en` para el "un solo uso" de 6.11; el enlace también existe `EN_SEGUIMIENTO`
  (`POST /seguimientos/:id/aceptacion` lo reenvía sin cerrar el caso; exige un intento `ACEPTA` previo).
- Token de retoma: 32 bytes base64url generado en SQL; en la tabla solo el sha256. Sale en claro una vez hacia el
  backend (solo al notificador). Al resolverlo se emite un `tokenAcceso` nuevo para la cotización (el viejo deja de servir).
- RN-09: al aplicar un descuento queda aceptado el mayor; `cerrar_solicitud(acepta=false)` desmarca los negociados.
- El advisory lock de los jobs está **dentro** de los RPC (`pg_try_advisory_xact_lock`), no en un servicio Nest.
- Conflictos con mensaje propio: `RAISE … USING ERRCODE = 'PT409'` → 409 (p. ej. "La solicitud ya fue tomada por otro asesor").
- RPC extra no listados en §6: `solicitar_asesoria`, `enviar_enlace_compra`, `caducar_seguimientos`.
- Si el notificador falla, el cambio queda guardado y la respuesta trae `warning: MENSAJE_NO_ENVIADO`.
- ASESOR: en listas, teléfono/email/documento enmascarados; en el detalle, teléfono y email completos; documento
  completo solo en la solicitud asignada a él (o para el ADMINISTRADOR, que solo lee).

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
  `/admin/prueba-choque/{escenarios[/:codigo], coberturas, frecuencias, zonas, factores}` (GET y PUT).
  `GET|PUT /admin/planes/:planId/contenido`, `GET /admin/coberturas`, `PUT /admin/coberturas/:codigo`, `GET /admin/contenido-planes/completitud`.
- `modules/cotizacion`: `GET /catalogo/{campos, vehiculos/marcas, …/modelos, …/anios, ubigeos/*}` (públicos),
  `TarifaSupabaseRepository` (service_role, caché 5 min), `CalculadoraPrimasService` (paralelo, timeout 2 s, RF-05), `unirCampos()` (RN-17).
  `/cotizaciones`: `POST` (público, 20/min), `GET :id/resumen` y `PATCH :id/aseguradoras/:aseguradoraId/suma-asegurada`
  (Bearer o `X-Cotizacion-Token`, vía `CotizacionAccesoGuard`), `PATCH :id/cliente` y `GET mias` (CLIENTE).
  Dominio puro en `domain/cotizacion.ts`: `decidirDerivacion` (RN-01..04), `verificarNicho` (RN-05), `validarContraCatalogo` (RF-03).
- `modules/asesoria-retencion`: `POST /asesorias` (CLIENTE), `GET /asesorias/cola?estado=&origen=` y `GET /asesorias/:id`
  (ASESOR, ADMIN lee), `POST /asesorias/:id/{tomar, descuentos, resultado}` (ASESOR), `GET /seguimientos?estado=`,
  `GET /seguimientos/:id`, `POST /seguimientos/:id/{intentos, aceptacion, cierre}`, `GET /retoma/:token` (público, 10/min).
  Jobs en `application/retencion.jobs.ts` con `@nestjs/schedule` 12.0.2: detector `0 * * * *` y caducidad `0 8 * * *` (America/Lima).
- `modules/prueba-choque`: `GET /prueba-choque/escenarios?uso=` (público), `POST|GET /cotizaciones/:id/prueba-choque`
  (Bearer o `X-Cotizacion-Token`, POST 20/min).
- `modules/planes`: `GET /planes/:planId/contenido` y `GET /planes/comparar?ids=` (públicos, máx. 3); exporta
  `CONTENIDO_PLAN_REPOSITORY` (caché 5 min) y `RESUMEN_PLANES` (lo usa el cotizador).
- `integracion/estrategias`: `EstrategiaBase` + Rímac, Pacífico, La Positiva, Mapfre, Qualitas (§17.5), con `parametrosSchema` (zod),
  `pesosRequeridos` / `pesosOpcionales`. `NotificadorSimulado` registra en el log (fuera de producción muestra el enlace;
  en producción lo oculta). Resto de adaptadores (pagos, emisión, PDF, clasificador): stubs `NotImplemented`.

### Scripts (`svas-backend/`)
`npm run verificar-env` · `npm run crear-admin -- --email X --nombre "Y"` · `npm run cambiar-password -- --email X` ·
`python scripts/generar-seed-tarifas.py <xlsx>`.

### Bruno (`svas-backend/bruno/`)
Credenciales en `bruno/.env` (ignorado). `.env.example` **siempre vacío**. Carpetas: 01 Auth · 02 Salud · 03 Catálogo admin ·
04 Tarifas admin (incluye simulaciones del caso dorado) · 05 Catálogo público · 06 Cotizaciones (guarda solas
`cotizacionId`, `tokenAcceso`, `rimacId`) · 07 Asesoría y retención (usa ASESOR_* y CLIENTE_* de `bruno/.env`) · 08 Prueba de choque (anónimo; crea su cotización) · 09 Prueba de choque admin (guarda sin cambiar nada + errores) · 10 Contenido de planes (público + admin, sin cambiar nada).

## 4. Convenciones que hay que respetar

- **Migraciones**: nunca editar una aplicada. Como ya hay aplicadas con números altos (0015–0023), las nuevas de número
  menor se aplican con `npx supabase db push --remote --include-all` (desde `svas-backend/`). Probar antes dentro de
  `begin … rollback` con `npx supabase@3.1.0 db query --remote --yes -f archivo.sql` (**pedir permiso al usuario**; es producción).
  Verificaciones con `--read-only` no necesitan permiso.
- **RPC**: `SECURITY DEFINER`, `set search_path = svas, public`, primera línea `perform svas.exigir_rol(...)`,
  bitácora antes/después en la misma transacción, `revoke … from public, anon` + `grant … to authenticated` **explícitos**.
  Errores: `P0001` → 400 (mensaje al usuario), `P0002` → 404, `PT409` → 409 (mensaje al usuario), `42501` → 403,
  `23505` → 409 (mensaje genérico).
- **Pruebas SQL**: en `begin … rollback` la salida se corta; terminar el script con `raise exception` que imprima los
  resultados filtrados por tramo (`where n >= X`). En concatenaciones, `(v->>'campo')` entre paréntesis.
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

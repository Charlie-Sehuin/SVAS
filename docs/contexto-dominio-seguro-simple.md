# SeguroSimple — Sistema de Venta Autónoma de Seguros (SVAS) — Documento de Contexto de Dominio

## Complemento de: `arquitectura-backend-seguro-simple.md` y `arquitectura-frontend-seguro-simple.md`

> **Cómo usar este documento**: se sube junto con los documentos de
> arquitectura backend, arquitectura frontend y conexión frontend↔backend al
> mismo "Proyecto" de Claude. Los documentos de arquitectura definen **cómo**
> se construye (patrones, capas, seguridad, convenciones, orden por olas).
> Este documento define **qué** se construye (el dominio: entidades, reglas,
> módulos, RPCs, roles, máquinas de estado, migraciones). Ante cualquier
> conflicto, **este documento manda**.
>
> **Fuentes**: Práctica 1 (perfil, AS-IS, requisitos RF/RNF, reglas RN-01 a
> RN-27, casos de uso CU-01 a CU-05) y Práctica 2 (diagrama de clases,
> enumeraciones, modelo relacional de 22 tablas, diseño arquitectónico) del
> Grupo N.° 4, Ingeniería de Software SI707V, UNI 2026-2. Los códigos RF, RNF,
> RN, CU y P se usan tal cual para mantener la trazabilidad con esos
> entregables.
>
> **Premisa de partida**: es un corredor de seguros vehiculares que compara
> cinco aseguradoras (Rímac, Pacífico, La Positiva, Mapfre, Qualitas) y
> permite cerrar la venta **sin depender de un asesor** cuando el caso no
> requiere evaluación ni negociación. A esto se suma un diferenciador nuevo
> —la **Prueba de Choque** (sección 3.8 y 16)— que cambia la pregunta del
> cliente de "¿cuál es el más barato?" a "¿cuánto me cuesta de verdad cuando
> algo pasa?".
>
> **Novedad respecto de la Práctica 2**: el diseño físico original contemplaba
> conexión directa con TypeORM. Esta versión adopta el patrón del proyecto
> de referencia: **Supabase (Auth + Postgres + Storage) + NestJS con
> `supabase-js`**, RLS en todas las tablas y **RPCs `SECURITY DEFINER`** para
> toda operación multi-tabla (reemplazan la "unidad de trabajo" de la sección
> 4.1.2 de la Práctica 2 con la misma garantía: todo o nada). Las 22 tablas,
> sus restricciones y los disparadores T1–T4 se conservan.
>
> **Novedad de esta versión — tarifas explicables**: la prima ya no sale de
> una "caja negra". Cada aseguradora tiene **sus propias tablas de tarifa**
> (tasa base por plan, pesos por marca, modelo, año, tipo o ubigeo, y un
> **rango de suma asegurada** por vehículo) y **su propia fórmula** (patrón
> Strategy). El cliente puede mover la suma asegurada dentro del rango de cada
> aseguradora y la prima —anual y mensual— se recalcula. Las tablas están en
> 4.1 (grupo D7) y todo el cálculo, con ejemplos numéricos, en la **sección 17**.
> Se agregan 11 tablas (4 de catálogo de vehículos/ubicación, 7 de tarifas),
> las reglas RN-37 a RN-41 y los RPCs 6.13 y los de tarifas en 6.12.
>
> **Novedad — contenido comercial por plan**: cada plan explica **qué cubre, qué
> no cubre, qué requisitos pide y para quién es**. Un catálogo común de 13
> coberturas se marca con sí/no en cada plan; además hay exclusiones y
> requisitos por plan. Son 5 tablas nuevas (grupo D8, en 4.1), las reglas
> RN-42 a RN-46, el RPC `admin_guardar_plan_contenido` (6.12) y la sección 18
> con el contenido de los 10 planes.

---

## Índice

1. Visión general del negocio
2. Glosario de dominio
3. Módulos de negocio y responsabilidades
4. Modelo de datos completo (entidades y relaciones)
5. Reglas de negocio no negociables
6. RPCs atómicos requeridos
7. Matriz de roles y permisos (RLS)
8. Flujos completos de extremo a extremo
9. Migraciones planeadas (orden y contenido)
10. Reportes y documentos requeridos
11. Alertas y procesos automáticos
12. Fuera de alcance (explícito)
13. Máquinas de estado por entidad (contrato para el frontend)
14. Matriz de permisos de UI por pantalla (rol × pantalla × acción)
15. Validaciones de negocio en UI (regla → mensaje → pantalla)
16. Funcionalidad diferencial: Prueba de Choque (detalle completo)
17. Tarifas y cálculo de primas por aseguradora (explicación completa)
18. Contenido comercial de cada plan (qué cubre, qué no cubre, requisitos, descripción)

---

## 1. Visión general del negocio

```
CLIENTE (celular, sin cuenta)
   │  datos del vehículo + ubicación + contacto + canal preferido
   ▼
COTIZADOR MULTIASEGURADORA ── formulario dinámico (unión de campos del catálogo)
   │  vehículo (marca/modelo/año) + ubigeo + SUMA ASEGURADA (dentro del rango
   │  que define cada aseguradora; el cliente puede moverla)
   │  EstrategiaCotizacion × 5 aseguradoras: cada una aplica SU fórmula sobre
   │  SUS tablas de tarifa (sección 17)  ──>  PRIMAS COTIZADAS
   │  (2 planes × 5 aseguradoras; prima anual + prima mensual en 12 cuotas)
   ▼
★ PRUEBA DE CHOQUE (nuevo) ── simula 6 siniestros típicos de Lima por plan
   │  "Costo Real Anual" = prima + desembolso esperado (deducibles, no cubiertos,
   │  días sin trabajar)  ──>  ranking honesto, no solo por precio
   ▼
DERIVACIÓN (RN-01..RN-06)
   ├── Opción 1: COMPRA AUTÓNOMA ── orden ── pago simulado ── póliza PDF (demo)
   └── Opción 2: ASESORÍA / DESCUENTO ── cola de asesoría ── negociación (≤ 10 %)
                                                   │
                         acepta ───────────────────┘──> compra con prima negociada
   ▼
¿No compró en 24 h? ── DETECTOR (job horario) ── SEGUIMIENTO / RETENCIÓN
   │  canal preferido · máx. 4 intentos en 7 días · motivo de cierre obligatorio
   └── mensaje final con ENLACE DE RETOMA (7 días) + descuento primera compra
       + resumen personalizado de la Prueba de Choque
   ▼
PANEL ADMINISTRATIVO ── catálogo configurable · parámetros · reportes por canal
```

El principio rector: **ningún dato capturado se vuelve a pedir (RNF-08), y
ninguna compra queda a medias (RNF-05)**. Cada venta debe poder reconstruirse
hacia atrás: póliza → pago → orden → prima cotizada → cotización → vehículo →
cliente, con su canal de venta atribuido (RN-27) y, si existió, la simulación
que el cliente vio antes de decidir.

Objetivos de negocio en orden de prioridad:
1. Cerrar ventas sin asesor en los casos estándar (OE2, P1, P6).
2. Que los casos que sí requieren asesor lleguen con datos completos (P2, P10).
3. Recuperar cotizaciones no concretadas sin acosar al cliente (OE3, P4).
4. **Diferenciarse por transparencia**: mostrar el costo real de cada plan
   ante un siniestro (Prueba de Choque, nuevo).
5. Medir qué canal, aseguradora y plan convierte mejor (OE5, P9).

---

## 2. Glosario de dominio

| Término | Definición |
|---|---|
| **Corredor** | Intermediario inscrito en la SBS; no asume el riesgo, cobra comisión a la aseguradora. |
| **Prima** | Precio **anual** (al contado) de un plan para una suma asegurada concreta (`prima_cotizada.prima`). La cuota mensual es `prima_cotizada.prima_mensual`. |
| **Prima final** | Prima tras aplicar un único descuento aceptado (`orden_compra.prima_final`). |
| **Suma asegurada** | Valor del vehículo que la aseguradora respalda ante pérdida total o robo. El cliente la elige **dentro del rango** (mínima–máxima) que cada aseguradora define para ese modelo y año. Es la base sobre la que se calcula la prima. |
| **Rango de suma asegurada** | Par (`suma_minima`, `suma_maxima`) por aseguradora, modelo y año. Si no existe la fila, esa aseguradora no cotiza ese vehículo. |
| **Tasa base** | Porcentaje anual de la suma asegurada que cobra un plan antes de ajustar por riesgo (p. ej. 4,2 % en el plan Oro de Rímac). Vive en `tarifa_plan.tasa_base`. |
| **Peso (factor de tarifa)** | Multiplicador cercano a 1 que ajusta la tasa según marca, modelo, año, tipo o ubigeo (1,15 = 15 % más caro que la base). Cada aseguradora tiene los suyos. |
| **Prima mensual** | Cuota que paga el cliente si elige 12 cuotas. Normalmente `prima ÷ 12`; en La Positiva incluye un recargo de fraccionamiento (RN-38). |
| **Ubigeo** | Código INEI de 6 dígitos (departamento + provincia + distrito). Pacífico lo usa para ajustar la prima por zona; la Prueba de Choque lo usa para la zona de riesgo. |
| **Desglose de cálculo** | Instantánea JSON de todo lo usado para calcular una prima (tasa base, pesos, parámetros, pasos). Se guarda en `prima_cotizada.detalle_calculo` (RN-41). |
| **Cobertura (comercial)** | Tipo de protección del catálogo común (daño por choque, robo total, responsabilidad civil, auxilio…). Cada plan la incluye o no (`plan_cobertura`). No es lo mismo que `cobertura_plan_escenario` (deducibles y topes de la Prueba de Choque). |
| **Qué cubre / qué no cubre** | Lista de las 13 coberturas del catálogo con ✓ o ✗ para un plan. "No cubre" es una fila con `incluida = false`, nunca una ausencia (RN-42). |
| **Exclusión** | Situación que el plan no cubre aunque la cobertura exista (conducir ebrio, uso distinto al declarado…). Tabla `plan_exclusion`. |
| **Requisito del plan** | Condición informativa para contratar (antigüedad del vehículo, edad del conductor, documentos, inspección). Tabla `plan_requisito`; no bloquea por sí sola (RN-44). |
| **Resumen / ideal para** | Una línea de venta y un perfil de cliente por plan (`plan.resumen`, `plan.ideal_para`). |
| **Deducible** | Parte del daño que paga el asegurado. Suele expresarse como `% del siniestro` con un `mínimo` en dinero, y varía si el taller es afiliado o no. |
| **Desembolso** | Lo que sale del bolsillo del cliente en un siniestro: deducible + parte no cubierta + ingreso perdido (solo uso comercial). |
| **Costo Real Anual (CRA)** | `prima + Σ (probabilidad anual del escenario × desembolso)`. Métrica central de la Prueba de Choque. |
| **Escenario de siniestro** | Evento tipo (choque leve, robo de autopartes, robo total…) con un monto de daño referencial y días de taller estimados. |
| **Opción 1** | Compra inmediata autónoma (`COMPRA_INMEDIATA`). |
| **Opción 2** | Asesoría, negociación o descuento (`ASESORIA`). |
| **Derivación** | Decisión del sistema de qué opciones habilitar (RN-01..RN-06), guardada en `cotizacion_opcion` y `cotizacion.motivo_derivacion`. |
| **Cola de asesoría** | `solicitud_asesoria` en estado `PENDIENTE` / `EN_ATENCION`, ordenada por RN-13. |
| **Seguimiento** | Caso de retención de una cotización no concretada (`seguimiento`). |
| **Enlace de retoma** | URL con token de un solo uso que reabre la compra autónoma con el descuento de primera compra (RN-12). |
| **Canal de venta** | `AUTONOMO`, `ASESORIA` o `TELEMARKETING` (RN-27). |
| **Segmento A / B** | A: uso particular (1–2 autos). B: uso comercial ligero (1–5 vehículos: taxi, apps, emprendedores). |
| **Estrategia** | Implementación por aseguradora del puerto `EstrategiaCotizacion` (patrón Strategy). Aplica la fórmula de esa aseguradora sobre sus tablas de tarifa (sección 17); es una función pura sin acceso a base de datos. |
| **Documento de demostración** | Todo PDF emitido lleva la leyenda «Documento de demostración sin validez legal» (RNF-20). |

---

## 3. Módulos de negocio y responsabilidades

Los nombres de módulo respetan el diagrama de paquetes de la Práctica 2
(2.1), en kebab-case. Cada uno vive en `src/modules/<modulo>/` del backend y
en `src/features/<modulo>/` del frontend.

### 3.1 `modules/seguridad/`
Login, registro mínimo de cliente, refresh, perfil propio y gestión de
usuarios/roles por el administrador (RF-31, RF-32). La contraseña la gestiona
Supabase Auth (bcrypt) — por eso la columna `usuario.hash_contrasena` de la
Práctica 2 **desaparece**: el hash vive en `auth.users`.

### 3.2 `modules/administracion/`
Dueño de la escritura del catálogo: aseguradoras, planes, campos requeridos,
valores permitidos, reglas de inspección y parámetros comerciales (RF-27 a
RF-29) y, desde esta versión, de las **tarifas** de cada aseguradora: tasa
base y parámetros por plan, pesos (marca, modelo, año, tipo, ubigeo) y rangos
de suma asegurada (sección 17). Todo cambio queda en `registro_actividad` en
la misma transacción (RNF-12). También expone los reportes (RF-30) y un
**simulador de tarifa**: el administrador elige un vehículo y una suma y ve
el desglose de la prima de cada aseguradora sin crear cotizaciones.

### 3.3 `modules/cotizacion/`
Lee el catálogo y el catálogo de vehículos (marcas → modelos → años) y de
ubigeos, arma el esquema del formulario dinámico (RF-02), valida contra el
catálogo (RF-03), ejecuta las estrategias **sobre las tablas de tarifa de cada
aseguradora** (RF-04, sección 17), propone una suma asegurada inicial por
aseguradora, aplica derivación (RF-08, RF-10) y registra todo en una sola
llamada RPC (`registrar_cotizacion`, 6.1). Después permite **ajustar la suma
asegurada** dentro del rango y recalcular las primas de esa aseguradora
(`actualizar_suma_asegurada`, 6.13). Si una aseguradora no cotiza, las demás
se muestran igual y se devuelve un `warning` (RF-05).

### 3.4 `modules/compra/`
Resumen, campos faltantes (solo los que no se capturaron, RNF-08), orden de
compra con aplicación automática del descuento de primera compra (RN-08),
firma simulada (RF-24) y orquestación del pago y la emisión (CU-02).

### 3.5 `modules/pagos/`
Sin endpoint propio (lo invoca `compra`). Puerto `PasarelaPago` con
adaptador `PasarelaSimulada` (APROBADO / RECHAZADO). Pago único o en
cuotas con cronograma (RF-23, RN-14).

### 3.6 `modules/polizas/`
Puerto `EmisionAseguradora` (número de póliza de prueba) y puerto
`GeneradorPdf` (PDFKit → Supabase Storage, bucket privado `polizas`).
Descarga mediante URL firmada temporal (RF-25, RN-15).

### 3.7 `modules/asesoria-retencion/`
Cola de asesoría (RF-11 a RF-15), descuentos negociados (RN-07, RN-09),
seguimiento con intentos, canal preferido y cierre con motivo (RF-16 a
RF-21, RN-10 a RN-13), enlace de retoma, detector de cotizaciones
abandonadas (job horario) y puerto `NotificadorMensajes` (simulado: log).

### 3.8 `modules/prueba-choque/` *(nuevo — diferenciador)*
Motor de simulación de siniestros. Para cada prima cotizada y cada
escenario aplicable, calcula el desembolso del cliente usando las reglas de
cobertura del plan (deducible %, mínimo, tope, condición de taller, días de
auto de reemplazo) y la probabilidad anual del escenario según uso, zona de
riesgo del distrito y perfil declarado. Devuelve el **Costo Real Anual** y
un ranking. Guarda una instantánea de los valores usados (sección 16). Su
dominio es una **función pura** en TypeScript → se prueba sin base de datos.

### 3.9 `modules/reportes/`
Ventas por canal, aseguradora y plan (RF-30), embudo de retención, e
impacto de la Prueba de Choque (sección 10). Los reportes devuelven JSON
para el panel y, opcionalmente, PDF.

### 3.10 `integracion/` (paquete transversal, no módulo de negocio)
Adaptadores de los puertos: 5 estrategias de cotización (una fórmula por
aseguradora; funciones puras que reciben la tarifa ya cargada, sección 17),
pasarela, emisión, PDF, notificador y, opcionalmente,
`ClasificadorPreocupaciones` (sección 16.6).

---

## 4. Modelo de datos completo (entidades y relaciones)

**Esquema**: `svas`. **Claves**: `uuid` por `gen_random_uuid()` salvo
`parametros_comerciales` (`smallint = 1`), `ubigeo` (código INEI `char(6)`) y
los años de las tablas de tarifa (`smallint`). **Montos**: `numeric(12,2)`.
**Porcentajes**: `numeric(5,2)`. **Probabilidades**: `numeric(6,4)`.
**Tasas base**: `numeric(6,4)`. **Pesos**: `numeric(5,3)`.
**Fechas**: `timestamptz` (solo `date` para vencimiento de cuota).
**Borrado**: `CASCADE` solo en composiciones; `RESTRICT` en el resto
(RN-16: se desactiva, no se borra).

```
aseguradora 1──* plan            aseguradora 1──* campo_requerido 1──* valor_permitido
aseguradora 1──* regla_inspeccion (uq aseguradora+uso)      parametros_comerciales (fila única)

TARIFAS (D7) ── datos de cada aseguradora que lee su Estrategia (sección 17):
plan 1──1 tarifa_plan                       (tasa_base + parametros jsonb)
aseguradora 1──* rango_suma_asegurada *──1 modelo   (mín–máx por modelo y año)
aseguradora 1──* peso_marca  *──1 marca     aseguradora 1──* peso_modelo *──1 modelo
aseguradora 1──* peso_anio                  aseguradora 1──* peso_tipo   *──1 tipo_vehiculo
aseguradora 1──* peso_ubigeo *──1 ubigeo
marca 1──* modelo *──1 tipo_vehiculo

CONTENIDO COMERCIAL (D8) ── lo que se le explica al cliente de cada plan (sección 18):
cobertura 1──* plan_cobertura *──1 plan      (sí/no por cada cobertura del catálogo)
plan 1──* plan_exclusion     plan 1──* plan_requisito
cobertura 1──* cobertura_escenario *──1 escenario_siniestro   (une con la Prueba de Choque)

auth.users 1──1 usuario 0..1──0..1 cliente 1──* vehiculo 1──1 ubicacion_uso
vehiculo *──1 modelo (la marca y el tipo salen del modelo)      ubicacion_uso *──1 ubigeo
vehiculo 1──* cotizacion 1──* cotizacion_opcion
cotizacion 1──* prima_cotizada *──1 plan
cotizacion 1──* solicitud_asesoria *──0..1 usuario(asesor)
cotizacion 1──0..1 seguimiento 1──* intento_contacto
cotizacion 1──* descuento *──1 plan
cotizacion 1──0..1 orden_compra ──1 prima_cotizada (FK compuesta misma cotización)
orden_compra 1──* pago 1──* cuota          orden_compra 1──0..1 poliza
usuario 1──* registro_actividad

★ escenario_siniestro 1──* cobertura_plan_escenario *──1 plan
★ escenario_siniestro 1──* frecuencia_escenario     zona_riesgo_distrito *──1 ubigeo
★ escenario_siniestro 1──* factor_perfil
★ cotizacion 1──* simulacion 1──* simulacion_resultado *──1 prima_cotizada
```

### 4.1 Propósito de cada tabla y columna

#### Catálogo y parámetros (D1)

**`aseguradora`** — `id`, `nombre varchar(60) UQ`, `activa boolean
DEFAULT true`, `codigo_estrategia varchar(30) UQ` (`RIMAC`, `PACIFICO`,
`LA_POSITIVA`, `MAPFRE`, `QUALITAS`; el backend resuelve la estrategia con
este código). `ck_aseguradora_estrategia`: mayúsculas y guion bajo.

**`plan`** — `id`, `aseguradora_id FK RESTRICT`, `nombre varchar(80)`,
`descripcion text` (texto largo, 2–4 oraciones), `resumen varchar(160)` ★
(una línea para la tarjeta), `ideal_para varchar(200)` ★ ("ideal para…"),
`orden smallint` ★ (posición dentro de la aseguradora: Plata antes que Oro),
`contenido_actualizado_en timestamptz` ★, `activo boolean`.
`uq_plan_aseguradora_nombre`. Un plan solo puede activarse si su contenido
está completo (RN-42, sección 18.10).

**`campo_requerido`** — `id`, `aseguradora_id`, `nombre varchar(40)`,
`tipo tipo_campo` (`TEXTO`, `NUMERO`, `LISTA`), `obligatorio`, `activo`,
`origen_valores varchar(10) NOT NULL DEFAULT 'ESTATICO'` (`ck_campo_origen`:
`ESTATICO` usa `valor_permitido`; `CATALOGO` toma las opciones de las tablas
`marca`/`modelo`/`ubigeo`/años de la sección D7). `uq_campo_aseguradora_nombre`.
Fuente del formulario dinámico (RN-17). Los campos `marca`, `modelo`, `anio`
y `ubigeo` son `LISTA` con `origen_valores = 'CATALOGO'`; `ubigeo` es
obligatorio porque Pacífico lo necesita (mensaje RF-03: "Pacífico necesita el
distrito para cotizarte"). `tipo` es obligatorio para La Positiva pero **no se
pregunta**: se autocompleta desde `modelo.tipo_id`.

**`valor_permitido`** — `id`, `campo_requerido_id FK CASCADE`, `valor
varchar(60)`. `uq_valor_por_campo`.

**`regla_inspeccion`** — `id`, `aseguradora_id`, `uso uso_vehiculo`,
`requiere_inspeccion boolean`. `uq_regla_aseguradora_uso` (RN-25).

**`parametros_comerciales`** — fila única (`ck_parametros_fila_unica`):
`descuento_primera_compra` (5,00), `descuento_maximo` (10,00),
`max_intentos` (4), `dias_seguimiento` (7), `max_cuotas` (12),
`vigencia_enlace_dias` (7), y nuevas en esta versión:
`horas_abandono smallint` (24, plazo del detector), `moneda char(3)`
('USD'), `tipo_cambio_referencial numeric(8,4)` (3,7500; solo para
convertir el ingreso diario que el taxista declara en soles).
`ck_parametros_descuentos`: 0 < primera ≤ máximo ≤ 100.

#### Catálogo de vehículos, ubicación y tarifas (D7) ★

Hasta aquí el catálogo decía **qué pide** cada aseguradora; D7 dice **cuánto
cobra**. Se separan dos grupos: el **catálogo compartido** (marcas, modelos,
tipos y ubigeos: los mismos para las 5 aseguradoras) y las **tarifas** (datos
propios de cada aseguradora, que su Estrategia lee para calcular la prima).
Las tablas guardan solo **datos**; las **fórmulas** viven en el código
(RN-40, sección 17).

**`marca`** — `id`, `nombre varchar(40) UQ`, `activa boolean DEFAULT true`.

**`tipo_vehiculo`** — `id`, `nombre varchar(30) UQ` (`Hatchback`, `Sedán`,
`SUV`, `Pickup`, `Minivan`).

**`modelo`** — `id`, `marca_id FK RESTRICT`, `tipo_id FK RESTRICT`,
`nombre varchar(50)`, `activo boolean`. `uq_modelo_marca_nombre`. El **tipo
pertenece al modelo** (un Corolla siempre es Sedán): el cliente no lo escribe
y La Positiva lo obtiene de aquí.

**`ubigeo`** — `codigo char(6) PK` (código INEI: 2 dígitos de departamento +
2 de provincia + 2 de distrito; `ck_ubigeo_codigo`: `~ '^[0-9]{6}$'`),
`departamento`, `provincia`, `distrito`. Reemplaza el texto libre de
`ubicacion_uso`.

**`tarifa_plan`** — `plan_id FK PK RESTRICT` (1:1 con `plan`), `tasa_base
numeric(6,4)` (`ck_tasa_base`: 0 < tasa < 1; `0.0420` = 4,2 % anual de la suma
asegurada), `parametros jsonb NOT NULL DEFAULT '{}'` (parámetros propios de la
fórmula de esa aseguradora; tabla más abajo), `actualizado_en timestamptz`.
Se separa de `plan` porque `plan` es catálogo legible por cualquier usuario
autenticado y la tarifa es información comercial (solo `ADMINISTRADOR`, 7).

**`rango_suma_asegurada`** — `aseguradora_id`, `modelo_id`, `anio smallint`,
`suma_minima numeric(12,2)`, `suma_maxima numeric(12,2)`. PK
`(aseguradora_id, modelo_id, anio)`; `ck_rango`: 0 < mínima ≤ máxima.
**La existencia de la fila significa "esta aseguradora cotiza este modelo en
este año"** (RN-39). Moneda: `parametros_comerciales.moneda`.

**Pesos** — cinco tablas con la misma forma (aseguradora + clave + `peso
numeric(5,3)`, `ck_peso`: 0,500–3,000). Un peso es un multiplicador cercano a
1: `1,150` = "15 % más caro que la base"; `0,950` = "5 % más barato".

| Tabla | Clave (PK junto con `aseguradora_id`) | La usan |
|---|---|---|
| `peso_marca` | `marca_id` | las 5 |
| `peso_modelo` | `modelo_id` | las 5 |
| `peso_anio` | `anio smallint` | las 5 |
| `peso_tipo` | `tipo_id` | solo La Positiva |
| `peso_ubigeo` | `ubigeo` (FK) | solo Pacífico |

Una aseguradora **solo tiene filas en las tablas de peso que su fórmula
usa**; las demás quedan vacías para ella.

**Claves de `tarifa_plan.parametros` por aseguradora** (las valida el `zod`
de cada Estrategia al guardar y al cargar):

| Aseguradora | `parametros` | Significado |
|---|---|---|
| Rímac | `{}` | no tiene |
| Pacífico | `{"cargo_fijo_anual": 45}` | USD que se suman a la prima anual (gastos de emisión) |
| La Positiva | `{"recargo_pago_mensual": 0.05}` | 5 % extra si paga en cuotas |
| Mapfre | `{"prima_minima_anual": 250}` | piso de la prima anual del plan |
| Qualitas | `{"descuento_comercial": 0.05}` | 5 % de descuento sobre la prima |

**Vista `v_tarifa_completitud`** (solo `ADMINISTRADOR`): por aseguradora,
modelo y año, qué rango o qué peso falta (sección 17.9).

#### Contenido comercial del plan (D8) ★

D7 dice **cuánto cuesta** cada plan; D8 dice **qué le ofrece al cliente**. Son
datos para mostrar y comparar (no afectan la prima). Al contrario de las
tarifas, **no son secreto comercial**: cualquier usuario autenticado los lee
(RN-46). Explicación completa y contenido de los 10 planes en la **sección 18**.

**`cobertura`** — `id`, `codigo varchar(30) UQ` (`DANO_CHOQUE`, `INCENDIO`,
`DESASTRES`, `LUNAS`, `ROBO_TOTAL`, `ROBO_PARCIAL`, `RC_TERCEROS`,
`ACC_OCUPANTES`, `AUXILIO_MECANICO`, `CHOFER_REEMPLAZO`, `AUTO_REEMPLAZO`,
`ASISTENCIA_LEGAL`, `EXTRATERRITORIAL`), `nombre varchar(80)`, `categoria
varchar(20)` (`ck_cobertura_categoria`: `DANOS_PROPIOS`, `ROBO`,
`RESPONSABILIDAD`, `ASISTENCIA`, `ADICIONAL`), `descripcion varchar(300)`,
`orden smallint`, `activa boolean DEFAULT true`. Es el **catálogo común**: las
mismas filas para las 5 aseguradoras (por eso los planes se pueden comparar).

**`plan_cobertura`** — `plan_id FK CASCADE`, `cobertura_id FK RESTRICT`,
`incluida boolean NOT NULL`, `detalle varchar(200) NULL` (texto que ve el
cliente: "Hasta USD 100,000", "4 servicios al año"), `limite_monto
numeric(12,2) NULL` (el monto del detalle, para ordenar y comparar). PK
`(plan_id, cobertura_id)`. `ck_plan_cobertura_coherente`: si `incluida =
false` entonces `limite_monto IS NULL`. **Cada plan activo tiene una fila por
cada cobertura activa** (RN-42): el "no cubre" es `incluida = false`.

**`plan_exclusion`** — `id`, `plan_id FK CASCADE`, `texto varchar(240)`,
`orden smallint`, `activa boolean DEFAULT true`. `uq_plan_exclusion_texto
(plan_id, texto)`. Exclusiones generales que valen aunque la cobertura exista.

**`plan_requisito`** — `id`, `plan_id FK CASCADE`, `tipo varchar(15)`
(`ck_requisito_tipo`: `VEHICULO`, `CONDUCTOR`, `DOCUMENTO`, `INSPECCION`),
`texto varchar(240)`, `obligatorio boolean DEFAULT true`, `orden smallint`,
`activo boolean DEFAULT true`. Informativo (RN-44).

**`cobertura_escenario`** — `cobertura_id FK RESTRICT`, `escenario_id FK
RESTRICT`. PK `(cobertura_id, escenario_id)`. 6 filas (18.3). Conecta la
cobertura comercial con los escenarios de la Prueba de Choque para que no se
contradigan (RN-43).

**Vista `v_plan_contenido_completitud`** (solo `ADMINISTRADOR`): por plan
activo, qué le falta al contenido y qué contradice a la Prueba de Choque
(sección 18.10).

**Borrado**: a diferencia del resto del catálogo, `plan_cobertura`,
`plan_exclusion` y `plan_requisito` se **reemplazan** al editar un plan (no se
desactivan fila por fila). Es seguro porque cada orden guarda su propia copia
del contenido (RN-45).

#### Seguridad, clientes y vehículos (D2)

**`usuario`** — `id uuid PK = auth.users.id` (FK `ON DELETE RESTRICT`),
`email varchar(254)`, `rol rol` (`CLIENTE`, `ASESOR`, `ADMINISTRADOR`),
`nombre_completo varchar(160)`, `activo boolean`. **Ajuste**: se elimina
`hash_contrasena` (Supabase Auth). Un trigger `tg_usuario_sync_rol`
copia `rol` a `auth.users.raw_app_meta_data.roles` (sección 7).

**`cliente`** — `id`, `usuario_id FK UQ NULL` (se puede cotizar sin cuenta),
`nombres`, `apellidos`, `numero_documento varchar(12) UQ NULL` (se pide en
CU-02), `telefono`, `email`, `canal_preferido canal_contacto`.
Checks de documento, email y teléfono como en la Práctica 2.

**`vehiculo`** — `id`, `cliente_id`, `uso uso_vehiculo`, `modelo_id FK
RESTRICT` (la marca sale de `modelo.marca_id`; **reemplaza** las columnas de
texto `marca` y `modelo`), `anio smallint` (1950–2100), `clase NULL`, `tipo
varchar(30) NULL` (se copia de `tipo_vehiculo.nombre` al registrar, como
instantánea), `placa varchar(7) NULL` (formato `ABC-123`/`ABC123`).

**`ubicacion_uso`** — `id`, `vehiculo_id FK CASCADE UQ`, `ubigeo char(6) FK
RESTRICT` (departamento, provincia y distrito salen del catálogo `ubigeo`;
**reemplaza** las tres columnas de texto). Composición 1:1 con vehículo.

#### Cotizaciones (D3)

**`cotizacion`** — `id`, `vehiculo_id`, `fecha`, `estado
estado_cotizacion` (`REGISTRADA`, `CONVERTIDA`, `NO_CONCRETADA`),
`motivo_derivacion motivo_asesoria NULL`, y nueva: `token_acceso_hash
varchar(64)` (SHA-256 del token que recibe el cliente anónimo para volver a
ver su cotización sin cuenta; el token en claro nunca se guarda).

**`cotizacion_opcion`** — `id`, `cotizacion_id FK CASCADE`, `opcion
opcion_venta`. `uq_opcion_por_cotizacion`.

**`prima_cotizada`** — `id`, `cotizacion_id FK CASCADE`, `plan_id`,
`suma_asegurada numeric(12,2) NULL` (la elegida por el cliente, dentro del
rango de la aseguradora; los dos planes de una misma aseguradora llevan la
misma, RN-37), `prima numeric(12,2) NULL` (**prima anual** al contado),
`prima_mensual numeric(12,2) NULL` (cuota si paga en 12 meses, RN-38),
`detalle_calculo jsonb NULL` (instantánea del cálculo, RN-41; solo
ASESOR/ADMIN), `motivo_no_disponible varchar(20) NULL` (`SIN_RANGO`,
`PESO_FALTANTE`, `ERROR_ESTRATEGIA`, RN-39), `disponible boolean`.
`ck_prima_disponible` (disponible ⇔ suma, prima y prima_mensual > 0 y sin
motivo; no disponible ⇔ los tres nulos y con motivo),
`uq_prima_cotizacion_plan`, `uq_prima_id_cotizacion` (soporte de FK compuesta
de `orden_compra`). Que la suma esté dentro del rango se valida **en RPC**
(cruza otra tabla, no cabe en un CHECK).

#### Asesoría y retención (D6)

**`solicitud_asesoria`** — `id`, `cotizacion_id`, `asesor_id NULL`
(obligatorio salvo `PENDIENTE`), `motivo motivo_asesoria`, `estado
estado_solicitud`, `canal`, `origen origen_caso`, `fecha_creacion`,
`resultado varchar(200) NULL`. `ck_solicitud_origen`: `SISTEMA` ⇔
`INSPECCION`/`NO_ASEGURABLE`. `ck_solicitud_resultado`: `CERRADA` exige
resultado. Disparador T1.

**`seguimiento`** — `id`, `cotizacion_id UQ`, `estado
estado_seguimiento`, `intentos smallint`, `fecha_apertura`, `fecha_cierre
NULL`, `motivo_cierre NULL`, `enlace_token varchar(64) UQ NULL`
(se guarda el **hash** del token, no el token), `enlace_expira_en NULL`.
`ck_seguimiento_cierre`, `ck_seguimiento_enlace`, `ck_seguimiento_fechas`.

**`intento_contacto`** — `id`, `seguimiento_id FK CASCADE`, `asesor_id`,
`canal`, `fecha`, `resultado resultado_intento`. Disparador T1.

**`descuento`** — `id`, `cotizacion_id`, `plan_id`, `asesor_id NULL`
(obligatorio si `NEGOCIADO`), `tipo tipo_descuento`, `porcentaje`, `fecha`,
`aceptado`. `uq_descuento_aceptado` (índice único parcial: un aceptado por
cotización). Disparadores T1 y T2.

#### Compra, pagos y pólizas (D4 y D5)

**`orden_compra`** — `id`, `cotizacion_id UQ`, `prima_cotizada_id UQ`
(FK compuesta `fk_orden_prima_misma_cotizacion`), `prima_final`,
`acepta_condiciones` (debe ser true), `firma_simulada`, `canal_venta`,
`contenido_plan jsonb NOT NULL` ★ (copia congelada de la descripción,
coberturas, exclusiones y requisitos del plan en el momento de comprar,
RN-45; formato en 18.8). `uq_orden_id_canal`.

**`pago`** — `id`, `orden_compra_id FK CASCADE`, `monto`, `modo
modo_pago`, `estado estado_pago`, `numero_cuotas NULL`, `referencia UQ`,
`fecha`. `ck_pago_cuotas`, `ck_pago_monto` (`monto` = total a pagar: en `CUOTAS` puede superar `prima_final` por el recargo de fraccionamiento, RN-38),
`uq_pago_confirmado_por_orden` (sin doble cobro). Disparador T3.

**`cuota`** — `id`, `pago_id FK CASCADE`, `numero`, `monto`,
`fecha_vencimiento date`, `estado estado_pago`. `uq_cuota_por_pago`.

**`poliza`** — `id`, `orden_compra_id UQ` (FK compuesta con canal),
`numero varchar(30) UQ`, `fecha_emision`, `archivo_pdf varchar(300)` (ruta
determinista `polizas/{poliza_id}.pdf` asignada al insertar; el archivo se
genera justo después), `canal_venta`. Disparador T4.

#### Trazabilidad

**`registro_actividad`** — `id`, `usuario_id NULL` (nulo = acción del
sistema, p. ej. el detector), `accion varchar(60)`, `entidad varchar(40)`,
`entidad_id uuid NULL` (nueva), `detalle jsonb NULL` (nuevo: valores antes
/después en cambios de catálogo), `fecha`. Append-only: el rol de la app no
tiene `UPDATE`/`DELETE`.

#### ★ Prueba de Choque (nuevas — detalle en sección 16)

**`escenario_siniestro`** — `id`, `codigo varchar(30) UQ` (`CHOQUE_LEVE`,
`CHOQUE_FUERTE`, `ROBO_AUTOPARTES`, `ROBO_TOTAL`, `DANO_TERCEROS`,
`PERDIDA_TOTAL`), `nombre varchar(80)`, `descripcion text` (lenguaje
llano, p. ej. "Te roban los espejos y el logo estacionado en la calle"),
`monto_dano_referencial numeric(12,2) NULL` (**nulo** en `ROBO_TOTAL` y
`PERDIDA_TOTAL`: su daño es la `suma_asegurada` del plan, sección 16.2),
`dias_taller_estimados smallint`, `activo boolean`.

**`cobertura_plan_escenario`** — `id`, `plan_id FK RESTRICT`,
`escenario_id FK RESTRICT`, `cubre boolean`, `deducible_pct numeric(5,2)
NULL`, `deducible_minimo numeric(12,2) NULL`, `tope_cobertura
numeric(12,2) NULL` (nulo = hasta la suma asegurada),
`condicion_taller condicion_taller` (`AFILIADO`, `CUALQUIERA`),
`dias_auto_reemplazo smallint DEFAULT 0`, `fuente varchar(200)` (de qué
documento salió el dato: condicionado, web, supuesto), `actualizado_en`.
`uq_cobertura_plan_escenario`. `ck_cobertura_coherente`: si `cubre = false`
los campos de deducible deben ser nulos.

**`frecuencia_escenario`** — `id`, `escenario_id`, `uso uso_vehiculo`,
`zona zona_riesgo` (`ALTA`, `MEDIA`, `BAJA`), `probabilidad_anual
numeric(6,4)` (0 < p < 1). `uq_frecuencia_escenario_uso_zona`.

**`zona_riesgo_distrito`** — `id`, `ubigeo char(6) FK RESTRICT`, `zona
zona_riesgo`. `uq_zona_ubigeo`. Ubigeo sin fila → zona `MEDIA` por defecto.

**`factor_perfil`** — `id`, `escenario_id`, `variable
variable_perfil` (`ESTACIONA_COCHERA`, `KM_MES_ALTO`, `USO_NOCTURNO`),
`multiplicador numeric(4,2)` (0,10–3,00). `uq_factor_escenario_variable`.

**`simulacion`** — `id`, `cotizacion_id FK CASCADE`, `perfil jsonb`
(respuestas del cliente: `{estacionaCochera, kmMesAlto, usoNocturno,
ingresoDiarioSoles, preocupaciones[]}`), `zona zona_riesgo`, `fecha`,
`version_reglas varchar(20)` (hash corto de las reglas vigentes al
simular), `vigente boolean NOT NULL DEFAULT true` (pasa a `false` si el
cliente cambia su suma asegurada después de simular, RN-37: la simulación se
sigue mostrando pero con aviso "desactualizada" hasta que se vuelva a simular).

**`simulacion_resultado`** — `id`, `simulacion_id FK CASCADE`,
`prima_cotizada_id`, `escenario_id`, `probabilidad_usada numeric(6,4)`,
`monto_dano_usado`, `monto_cubierto`, `deducible_aplicado`,
`no_cubierto`, `ingreso_perdido`, `desembolso_cliente`. **Instantánea**:
los valores se copian, nunca se recalculan desde el catálogo (igual que
`unit_cost_at_consumption` en el proyecto de referencia).

**`simulacion_plan`** — `id`, `simulacion_id FK CASCADE`,
`prima_cotizada_id`, `costo_real_anual numeric(12,2)`,
`peor_caso numeric(12,2)`, `ranking smallint`, `datos_completos boolean`.
`uq_simulacion_plan`.

### 4.2 Enumeraciones (tipos PostgreSQL)

Se conservan los 16 de la Práctica 2 (2.2.4) y se agregan 3:

| Enumeración | Valores |
|---|---|
| `rol` | `CLIENTE`, `ASESOR`, `ADMINISTRADOR` |
| `uso_vehiculo` | `PARTICULAR`, `COMERCIAL_LIGERO`, `TRANSPORTE_PASAJEROS` |
| `canal_contacto` | `LLAMADA`, `WHATSAPP` |
| `estado_cotizacion` | `REGISTRADA`, `CONVERTIDA`, `NO_CONCRETADA` |
| `opcion_venta` | `COMPRA_INMEDIATA`, `ASESORIA` |
| `motivo_asesoria` | `DUDA`, `NEGOCIACION`, `DESCUENTO`, `INSPECCION`, `NO_ASEGURABLE` |
| `origen_caso` | `SISTEMA`, `CLIENTE` |
| `estado_solicitud` | `PENDIENTE`, `EN_ATENCION`, `CERRADA` |
| `tipo_descuento` | `PRIMERA_COMPRA`, `NEGOCIADO` |
| `estado_seguimiento` | `EN_SEGUIMIENTO`, `CONVERTIDO`, `DESCARTADO` |
| `motivo_cierre` | `PRECIO`, `YA_CONTRATO`, `NO_RESPONDE`, `SIN_INTERES`, `OTRO` |
| `resultado_intento` | `CONTACTADO`, `NO_RESPONDE`, `RECHAZA`, `ACEPTA` |
| `modo_pago` | `UNICO`, `CUOTAS` |
| `estado_pago` | `PENDIENTE`, `CONFIRMADO`, `RECHAZADO` |
| `canal_venta` | `AUTONOMO`, `ASESORIA`, `TELEMARKETING` |
| `tipo_campo` | `TEXTO`, `NUMERO`, `LISTA` |
| ★ `zona_riesgo` | `ALTA`, `MEDIA`, `BAJA` |
| ★ `condicion_taller` | `AFILIADO`, `CUALQUIERA` |
| ★ `variable_perfil` | `ESTACIONA_COCHERA`, `KM_MES_ALTO`, `USO_NOCTURNO` |

> El rol se guarda como enum (decisión de la Práctica 2), a diferencia del
> proyecto de referencia que usaba `text + CHECK`. Agregar un rol exige
> `ALTER TYPE rol ADD VALUE`, aceptable porque los tres roles son estables.

### 4.3 Índices recomendados

- Uno por cada FK no cubierta por un `UNIQUE`.
- Cola de asesoría: `(estado, origen, fecha_creacion)` parcial `WHERE
  estado <> 'CERRADA'` (RN-13).
- Cola de seguimiento: `(estado, fecha_apertura)` parcial `WHERE estado =
  'EN_SEGUIMIENTO'`.
- Detector: `cotizacion (estado, fecha)` parcial `WHERE estado =
  'REGISTRADA'`.
- Reportes: `poliza (fecha_emision, canal_venta)`, `pago (estado, fecha)`.
- Primera compra: `cliente (numero_documento)` ya es `UNIQUE`.
- Prueba de choque: `frecuencia_escenario (uso, zona)`,
  `cobertura_plan_escenario (plan_id)`.
- Tarifas: las PK compuestas de `rango_suma_asegurada` y de las tablas `peso_*`
  ya cubren la búsqueda por aseguradora; se agregan `rango_suma_asegurada
  (modelo_id, anio)` (años disponibles de un modelo), `modelo (marca_id)` y
  `ubigeo (departamento, provincia)` (selectores en cascada).

---

## 5. Reglas de negocio no negociables

Se consolidan las RN de la Práctica 1 y se agregan las de la Prueba de
Choque (RN-28 a RN-36), las de Tarifas (RN-37 a RN-41) y las de Contenido
comercial de planes (RN-42 a RN-46). Donde dice **"en RPC"**, la validación vive dentro
de la función `SECURITY DEFINER` (única barrera real: esas funciones no
están sujetas a RLS). Donde dice **"en dominio"**, vive en una entidad
TypeScript probada con Jest.

1. **Derivación (RN-01 a RN-04) — en dominio, persistida en RPC.**
   `Cotizacion.habilitarOpciones()`: particular estándar → ambas opciones;
   comercial sin inspección y no pasajeros → ambas; si `regla_inspeccion`
   exige inspección para ese uso → **solo `ASESORIA`** y se crea
   `solicitud_asesoria` con `origen = SISTEMA, motivo = INSPECCION`;
   no asegurable en línea (ninguna prima disponible) → solo `ASESORIA`,
   `motivo = NO_ASEGURABLE`.
2. **Nicho (RN-05) — en dominio.** Uso particular ≤ 2 vehículos por
   documento; comercial ≤ 5. Fuera de nicho: se informa y **no** se crea
   cotización ni solicitud.
3. **Separación de flujos (RN-06) — en RPC `crear_orden_compra`.** La
   Opción 1 no admite descuento `NEGOCIADO` salvo que ya exista uno
   aceptado registrado por un asesor.
4. **Tope de descuento (RN-07) — disparador T2.** Ningún `descuento.porcentaje`
   supera `parametros_comerciales.descuento_maximo` vigente.
5. **Primera compra (RN-08) — en RPC `crear_orden_compra`.** Se aplica
   automáticamente si no existe `poliza` asociada a ningún `cliente` con el
   mismo `numero_documento`.
6. **No acumulables (RN-09) — índice único parcial + RPC.** Un solo
   descuento `aceptado` por cotización; si hay dos, se acepta el mayor.
7. **Contacto (RN-10) — en RPC `registrar_intento_contacto` con `SELECT …
   FOR UPDATE` sobre `seguimiento`.** Respeta `canal_preferido`; rechaza si
   `intentos >= max_intentos` o si pasaron más de `dias_seguimiento` desde
   `fecha_apertura`. Al alcanzar el máximo, el caso se cierra como
   `DESCARTADO / NO_RESPONDE`.
8. **Cierre con motivo (RN-11) — check `ck_seguimiento_cierre`.**
9. **Un solo mensaje final (RN-12) — en RPC `cerrar_seguimiento`.** Genera
   un enlace con vigencia `vigencia_enlace_dias`; un seguimiento cerrado no
   vuelve a enviar mensajes.
10. **Orden de la cola (RN-13).** Primero `origen = SISTEMA`, luego
    `CLIENTE`; dentro de cada grupo por `fecha_creacion`.
11. **Cuotas (RN-14) — check + disparador T3.**
12. **Póliza solo con pago confirmado (RN-15) — disparador T4.**
13. **Desactivar, no borrar (RN-16).** El rol de la app no tiene `DELETE`
    sobre catálogo (excepto `valor_permitido`).
14. **Formulario = unión de campos activos (RN-17) — en dominio.**
15. **Atribución de canal (RN-27) — en RPC `crear_orden_compra`.**
    `TELEMARKETING` si la compra viene de enlace de retoma o de un
    `intento_contacto` con resultado `ACEPTA`; `ASESORIA` si usa prima
    negociada; `AUTONOMO` en los demás casos.
16. **Atomicidad de la compra (RNF-05) — RPC `confirmar_compra`.** Pago
    confirmado + cuotas + póliza + cotización `CONVERTIDA` + seguimiento
    `CONVERTIDO` en una sola transacción. Si algo falla, nada queda.
17. **Toda acción crítica deja rastro (RNF-12).** Cotizar, aplicar
    descuento, contactar, cambiar estado y cambiar catálogo insertan en
    `registro_actividad` dentro del mismo RPC.
18. **Todo PDF lleva la leyenda de demostración (RNF-20).**

**Reglas nuevas — Prueba de Choque:**

19. **RN-28 — Informativa, nunca vinculante.** La simulación no modifica
    primas, descuentos ni el flujo de derivación.
20. **RN-29 — Leyenda obligatoria.** Todo resultado muestra: «Estimación
    referencial basada en condiciones resumidas. Prevalece el condicionado
    de la aseguradora.»
21. **RN-30 — Sin dato no hay supuesto favorable.** Si un plan no tiene
    `cobertura_plan_escenario` para un escenario aplicable, ese escenario se
    marca "Sin información", el plan queda `datos_completos = false` y
    **nunca** ocupa el puesto 1 del ranking.
22. **RN-31 — Probabilidades y montos son parámetros.** Valores iniciales =
    supuestos a validar con el negocio; los edita el administrador y cada
    cambio queda en `registro_actividad`.
23. **RN-32 — Instantánea.** `simulacion_resultado` guarda los valores
    usados; un cambio posterior del catálogo no altera simulaciones pasadas.
24. **RN-33 — Ingreso perdido solo en uso comercial.** Se calcula solo para
    `COMERCIAL_LIGERO` y `TRANSPORTE_PASAJEROS` y solo si el cliente
    declara su ingreso diario.
25. **RN-34 — Ranking.** Orden ascendente por `costo_real_anual`; empate →
    menor prima; planes con datos incompletos al final de su grupo.
26. **RN-35 — Retención con valor.** Si la cotización tiene simulación, el
    mensaje final de retención (RN-12) incluye la frase de mayor contraste
    (p. ej. "Con el plan más barato habrías pagado USD 1 200 por un robo de
    autopartes; con el plan X, USD 150").
27. **RN-36 — Privacidad del perfil.** El perfil declarado (cochera, uso
    nocturno, ingreso) solo se usa para la simulación y el seguimiento
    (Ley N.° 29733); no se comparte con las aseguradoras.

**Reglas nuevas — Tarifas de primas** (explicadas con ejemplos en la sección 17):

28. **RN-37 — Suma asegurada dentro del rango — en dominio y en RPC.** La
    suma asegurada de una prima cotizada debe estar entre `suma_minima` y
    `suma_maxima` del `rango_suma_asegurada` de **esa aseguradora** para ese
    modelo y año (cada aseguradora tiene su rango; los dos planes de una misma
    aseguradora comparten la suma). Al cotizar se propone el **punto medio del
    rango redondeado a USD 100**. Solo se puede cambiar mientras la
    cotización no tenga `orden_compra`; al cambiarla, las simulaciones previas
    de la cotización pasan a `vigente = false`. La validan el dominio (mensaje
    al cliente) y, otra vez, los RPC 6.1 y 6.13.
29. **RN-38 — Prima anual y prima mensual.** `prima_cotizada.prima` es la
    prima anual al contado; `prima_mensual` es la cuota si paga en 12 meses.
    Cada Estrategia define cómo se fracciona: `prima ÷ 12` en Rímac, Pacífico,
    Mapfre y Qualitas; `prima × (1 + recargo) ÷ 12` en La Positiva. Montos con
    2 decimales, redondeo half-up, siempre con `decimal.js`. En modo `CUOTAS`
    `pago.monto` es el **total de las cuotas** y la última cuota absorbe el
    redondeo. El descuento (RN-08/RN-09) se aplica sobre la prima anual
    (`prima_final`) **antes** de fraccionar.
30. **RN-39 — Sin dato de tarifa no hay prima.** Si no existe
    `rango_suma_asegurada` para (aseguradora, modelo, año) → `disponible =
    false`, motivo `SIN_RANGO`. Si hay rango pero falta algún peso que la
    fórmula exige (marca, modelo, año o tipo) → `disponible = false`, motivo
    `PESO_FALTANTE` (nunca se asume 1,00, mismo espíritu que RN-30).
    **Excepción:** un ubigeo sin `peso_ubigeo` (Pacífico) usa 1,00 "zona
    estándar" y lo deja anotado en el desglose. Si ninguna aseguradora queda
    disponible → RN-04 (solo `ASESORIA`, `NO_ASEGURABLE`).
31. **RN-40 — Cada aseguradora, su fórmula (Strategy).** Las fórmulas viven en
    TypeScript puro (una clase por aseguradora); las tablas guardan solo datos
    y parámetros. No hay lógica de tarifa en SQL ni en el frontend. Agregar
    una aseguradora = datos en sus tablas + una clase nueva (17.11).
32. **RN-41 — Prima explicable e inmutable.** Cada `prima_cotizada` guarda su
    `detalle_calculo` (tasa base, pesos usados, parámetros del plan, pasos
    intermedios). Un cambio posterior de tarifas no altera primas ya
    cotizadas. El cliente **no** ve el desglose (es información comercial);
    el asesor (en su caso) y el administrador sí.
33. **RN-42 — Todas las coberturas, sí o no.** Cada plan activo tiene
    exactamente una fila `plan_cobertura` por cada `cobertura` activa. "No
    cubre" es `incluida = false`, nunca una fila ausente. Un plan con filas
    faltantes, sin `resumen`/`descripcion`/`ideal_para`, sin requisitos o sin
    exclusiones tiene contenido incompleto y **no puede activarse** (en RPC
    `admin_cambiar_estado_plan`, vía `v_plan_contenido_completitud`).
34. **RN-43 — Sin contradicciones con la Prueba de Choque.** Para cada
    cobertura ligada a escenarios (`cobertura_escenario`): si el plan la marca
    `incluida = true`, al menos uno de sus escenarios tiene `cubre = true` en
    `cobertura_plan_escenario`; si `incluida = false`, todos tienen `cubre =
    false`. Se valida al guardar contenido y en el seed, y la vista lo reporta.
35. **RN-44 — Los requisitos informan, no bloquean.** `plan_requisito` se
    muestra al cliente pero no impide cotizar ni comprar. Lo que bloquea
    sigue siendo: rango de suma (RN-39), campos requeridos (RF-03), regla de
    inspección (RN-03) y nicho (RN-05). El requisito de antigüedad del
    vehículo debe coincidir con los años que cargan los rangos.
36. **RN-45 — Lo que el cliente vio es lo que contrató.** `crear_orden_compra`
    recibe la copia del contenido del plan (`p_contenido_plan`) y la guarda en
    `orden_compra.contenido_plan`; la póliza PDF se genera desde esa copia.
    Editar el contenido después no cambia órdenes ni pólizas existentes (mismo
    espíritu que RN-41).
37. **RN-46 — Contenido público, ilustrativo y auditado.** Es lectura para
    cualquier usuario autenticado (no es secreto comercial); escribe solo el
    `ADMINISTRADOR` vía RPC con rastro en `registro_actividad`. Todo texto es
    ilustrativo (RN-26): las pantallas y el PDF llevan la leyenda «Contenido
    ilustrativo; no es el condicionado de la aseguradora».

---

## 6. RPCs atómicos requeridos

Patrón: `SECURITY DEFINER`, `SET search_path = svas, public`, lanzan
`RAISE EXCEPTION` con mensaje en español (el filtro del backend lo traduce
a 400/409). **Validación de rol obligatoria al inicio**:

- RPCs de **flujo público** (cotizar, simular, retoma): `GRANT EXECUTE`
  solo a `service_role`. Los llama el backend con el cliente de servicio
  después de validar el `X-Cotizacion-Token`. Sin `auth.uid()`.
- RPCs de **usuarios autenticados**: `GRANT EXECUTE` a `authenticated`;
  primera línea: `PERFORM svas.exigir_rol(ARRAY['ASESOR','ADMINISTRADOR'])`,
  helper que consulta `svas.usuario` por `auth.uid()` y `activo = true`.

### 6.1 `registrar_cotizacion(p_payload jsonb)` → `{cotizacion_id, opciones[], primas[]}`
Rol: `service_role`. En una transacción: busca o crea `cliente` (por email
+ teléfono si no hay documento), crea `vehiculo` + `ubicacion_uso`,
`cotizacion` con `token_acceso_hash`, las `prima_cotizada` calculadas por
el backend (el RPC **no** calcula primas: las estrategias viven en
TypeScript) con su `suma_asegurada`, `prima`, `prima_mensual`,
`detalle_calculo` o `motivo_no_disponible`, las `cotizacion_opcion` decididas
por el dominio y, si corresponde, la `solicitud_asesoria` de origen `SISTEMA`.
**Vuelve a validar RN-37** (suma dentro del rango de esa aseguradora para el
modelo y año) como defensa en profundidad. Inserta
`registro_actividad('COTIZAR')`.

### 6.2 `registrar_simulacion(p_cotizacion_id uuid, p_payload jsonb)` ★
Rol: `service_role` (flujo público) o `authenticated` dueño de la
cotización. Inserta `simulacion`, `simulacion_resultado` y
`simulacion_plan` calculados por el dominio `prueba-choque`. Valida que
cada `prima_cotizada_id` pertenezca a `p_cotizacion_id`.

### 6.3 `crear_orden_compra(p_cotizacion_id, p_prima_cotizada_id, p_origen text, p_datos_faltantes jsonb, p_contenido_plan jsonb)`
Rol: `CLIENTE` dueño o `service_role` (retoma). `SELECT … FOR UPDATE`
sobre `cotizacion`. Valida estado ≠ `CONVERTIDA`, que `COMPRA_INMEDIATA`
esté habilitada o exista descuento negociado aceptado, completa
`numero_documento`/`placa`, aplica RN-08/RN-09, calcula `prima_final` (=
prima **anual** vigente × (1 − descuento); desde aquí la suma asegurada ya no
puede cambiar, RN-37), atribuye canal (RN-27), **guarda la copia del contenido del plan
(`p_contenido_plan`, RN-45; rechaza `NULL` o un `planId` distinto al de la prima)**
y crea la orden.

### 6.4 `confirmar_compra(p_orden_id, p_modo, p_numero_cuotas, p_referencia, p_numero_poliza, p_monto_total)` → `{poliza_id, archivo_pdf}`
Rol: `CLIENTE` dueño. El backend ya llamó a `PasarelaPago` y a
`EmisionAseguradora` (simulados). Inserta `pago CONFIRMADO`, cronograma de
`cuota`, `poliza` con ruta determinista, `cotizacion.estado =
'CONVERTIDA'`, `seguimiento.estado = 'CONVERTIDO'` si existía, y
`registro_actividad`. Si la pasarela rechazó, el backend llama en su lugar a
`registrar_pago_rechazado` (solo inserta `pago RECHAZADO`).
`p_monto_total` lo calcula el backend con `Estrategia.totalEnCuotas()` (RN-38):
en modo `UNICO` debe ser igual a `prima_final`; en `CUOTAS` puede ser mayor
(recargo de La Positiva). El RPC rechaza un monto menor que `prima_final` o,
en `UNICO`, distinto de ella. `pago.monto` guarda este total y
`generar_cuotas` lo reparte en `numero_cuotas` partes; la última absorbe el
redondeo.

### 6.5 `tomar_solicitud(p_solicitud_id)` 
Rol: `ASESOR`. `FOR UPDATE SKIP LOCKED`: pasa de `PENDIENTE` a
`EN_ATENCION` y asigna `asesor_id = auth.uid()`. Si otro asesor la tomó,
error 409 "La solicitud ya fue tomada por otro asesor".

### 6.6 `aplicar_descuento_negociado(p_solicitud_id, p_plan_id, p_porcentaje)`
Rol: `ASESOR` asignado. Inserta `descuento NEGOCIADO`; si existe otro
aceptado, deja aceptado solo el mayor (RN-09); T2 valida el tope.

### 6.7 `cerrar_solicitud(p_solicitud_id, p_resultado, p_acepta boolean)`
Rol: `ASESOR` asignado. Cierra; si acepta, el cliente queda habilitado a
comprar con prima negociada (RF-15).

### 6.8 `registrar_intento_contacto(p_seguimiento_id, p_canal, p_resultado)`
Rol: `ASESOR`. Lock + RN-10 + incremento de `intentos`. Si alcanza el
máximo, invoca internamente `cerrar_seguimiento(..., 'NO_RESPONDE')`.

### 6.9 `cerrar_seguimiento(p_seguimiento_id, p_estado, p_motivo)` → `{enlace_token}`
Rol: `ASESOR` o `service_role` (detector). Si `DESCARTADO`, genera token
aleatorio de 32 bytes, guarda su hash y vencimiento y devuelve el token en
claro **una sola vez** al backend para que el notificador lo envíe.

### 6.10 `detectar_cotizaciones_abandonadas()` → `int`
Rol: `service_role` (job). Marca `NO_CONCRETADA` las `REGISTRADA` sin
orden ni solicitud abierta con antigüedad > `horas_abandono` y abre su
`seguimiento`. Idempotente (`ON CONFLICT (cotizacion_id) DO NOTHING`).

### 6.11 `resolver_enlace_retoma(p_token_hash)` → `{cotizacion_id, descuento}`
Rol: `service_role`. Valida vigencia, marca el token como usado
(un solo uso), reemplaza `cotizacion.token_acceso_hash` por el hash de un
token nuevo que genera el backend (para que el cliente vuelva a entrar sin
cuenta) y devuelve la cotización con el descuento de primera compra.

### 6.12 RPCs de administración (todas con rol `ADMINISTRADOR` y fila en `registro_actividad` con `detalle` antes/después)
`admin_actualizar_parametros`, `admin_cambiar_estado_aseguradora`,
`admin_cambiar_estado_plan`, `admin_guardar_campo` (con sus valores
permitidos), `admin_guardar_regla_inspeccion`,
`admin_guardar_cobertura` ★, `admin_guardar_frecuencia` ★,
`admin_guardar_escenario` ★, `admin_cambiar_rol_usuario`, y las de **tarifas**:
`admin_guardar_tarifa_plan` (tasa base + `parametros`), `admin_guardar_pesos`
(carga masiva a una de las cinco tablas `peso_*`) y
`admin_guardar_rangos_suma` (carga masiva de `rango_suma_asegurada`). Cada una
valida el rango de valores (`ck_peso`, `ck_rango`, `ck_tasa_base`) y el
`zod` de `parametros` según `codigo_estrategia`, y guarda el antes/después en
`registro_actividad.detalle`.

Para el **contenido comercial** (D8): `admin_guardar_plan_contenido(p_plan_id,
p_payload jsonb)` reemplaza **en una sola transacción** el `resumen`, la
`descripcion`, `ideal_para`, las filas de `plan_cobertura`, `plan_exclusion` y
`plan_requisito` de un plan (todo o nada), actualiza
`plan.contenido_actualizado_en` y devuelve las advertencias de RN-42/RN-43;
`admin_guardar_cobertura_catalogo(p_payload jsonb)` crea o edita una cobertura
del catálogo y, si es nueva y activa, deja el contenido de los planes activos
**incompleto** hasta que se defina su fila. `admin_cambiar_estado_plan`
rechaza activar un plan con `completo = false` (RN-42).

### 6.13 `actualizar_suma_asegurada(p_cotizacion_id uuid, p_aseguradora_id uuid, p_primas jsonb)` → `{primas[], simulaciones_invalidadas int}`
Rol: `service_role` (flujo público con token) o `authenticated` dueño de la
cotización. El backend ya recalculó las primas con la Estrategia de esa
aseguradora (el RPC **no** calcula, igual que 6.1). En una transacción:
`SELECT … FOR UPDATE` sobre `cotizacion`; rechaza si el estado es `CONVERTIDA`
o si ya existe `orden_compra` ("La cotización ya tiene una compra en curso");
**vuelve a validar RN-37** (la suma debe estar entre `suma_minima` y
`suma_maxima` del rango de esa aseguradora para el modelo y año del vehículo;
`P0001` "La suma asegurada de {aseguradora} debe estar entre USD {mín} y USD
{máx}"); actualiza `suma_asegurada`, `prima`, `prima_mensual` y
`detalle_calculo` de las `prima_cotizada` **de esa aseguradora** (las de otras
no se tocan); marca `simulacion.vigente = false` en las simulaciones de la
cotización; inserta `registro_actividad('AJUSTAR_SUMA')` con la suma antes y
después.

---

## 7. Matriz de roles y permisos (RLS)

Los roles de negocio viven en `svas.usuario.rol` y se sincronizan a
`auth.users.raw_app_meta_data.roles` (array, para seguir el mismo contrato
del proyecto de referencia: `app_metadata.roles`). **Nunca** en
`user_metadata`.

| Acción | CLIENTE | ASESOR | ADMINISTRADOR | Anónimo (sin cuenta) |
|---|---|---|---|---|
| Cotizar y comparar | Sí | No (no es su flujo) | Sí (pruebas) | Sí, vía backend |
| Prueba de Choque | Sí (sus cotizaciones) | Lectura de la cotización del caso | Sí | Sí, vía backend |
| Comprar (Opción 1) | Sí (dueño) | No | No | Debe registrarse en el paso de datos |
| Solicitar asesoría (Opción 2) | Sí | No | No | Registro mínimo |
| Ver mis pólizas / pagos | Sí (propios) | No | Lectura | No |
| Atender cola de asesoría | No | Sí | Lectura | No |
| Negociar descuento | No | Sí (≤ tope) | No | No |
| Gestionar seguimiento | No | Sí | Lectura | No |
| Editar catálogo y parámetros | No | No | Sí | No |
| Editar reglas de Prueba de Choque | No | No | Sí | No |
| Ajustar suma asegurada (dentro del rango) | Sí (dueño) | No | No | Sí, vía backend con token |
| Editar tarifas (tasas, pesos, rangos de suma) | No | No | Sí | No |
| Ver contenido del plan (cubre / no cubre / requisitos) | Sí | Sí | Sí | Sí, vía backend |
| Editar contenido de planes (coberturas, exclusiones, requisitos) | No | No | Sí | No |
| Ver desglose de cálculo de la prima | No | Sí (caso asignado) | Sí | No |
| Reportes | No | Su desempeño | Todos | No |
| Usuarios y roles | No | No | Sí | No |
| `registro_actividad` | No | No | Lectura | No |

Policies por tabla (resumen; detalle en cada migración):

- **Catálogo** (`aseguradora`, `plan`, `campo_requerido`, `valor_permitido`,
  `regla_inspeccion`, `escenario_siniestro`, `cobertura_plan_escenario`,
  `frecuencia_escenario`, `factor_perfil`, `zona_riesgo_distrito`): `SELECT`
  para `authenticated` solo filas activas; escritura solo vía RPC admin.
- **Contenido comercial** (`cobertura`, `cobertura_escenario`,
  `plan_cobertura`, `plan_exclusion`, `plan_requisito`): `SELECT` para
  `authenticated` (solo filas activas de planes activos); escritura solo vía
  RPC admin. No es secreto comercial (RN-46). La vista
  `v_plan_contenido_completitud` es solo `ADMINISTRADOR`.
- **Catálogo de vehículos** (`marca`, `tipo_vehiculo`, `modelo`, `ubigeo`):
  `SELECT` para `authenticated`; escritura solo vía RPC admin o seed.
- **Tarifas** (`tarifa_plan`, `rango_suma_asegurada`, `peso_marca`,
  `peso_modelo`, `peso_anio`, `peso_tipo`, `peso_ubigeo`): son el secreto
  comercial del corredor → `SELECT` **solo `ADMINISTRADOR`**; escritura solo
  vía RPC admin. El backend las lee con el cliente de servicio dentro de
  `TarifaSupabaseRepository` (backend 4.2). Los DTO nunca las devuelven: el
  cliente solo recibe la suma, el rango de cada aseguradora y las primas ya
  calculadas.
- **`cliente`, `vehiculo`, `cotizacion` y dependientes**: `SELECT` si
  `cliente.usuario_id = auth.uid()`, o si el usuario es `ASESOR` y existe
  solicitud/seguimiento de esa cotización, o `ADMINISTRADOR`.
- **`solicitud_asesoria`, `seguimiento`, `intento_contacto`, `descuento`**:
  `ASESOR` y `ADMINISTRADOR`; el cliente ve solo el estado de sus
  solicitudes.
- **`orden_compra`, `pago`, `cuota`, `poliza`**: dueño y `ADMINISTRADOR`.
- **Escritura en tablas de negocio**: solo vía RPC. Ningún `INSERT`/`UPDATE`
  directo desde `authenticated`.

**Campos sensibles por rol** (se excluyen del DTO, no solo por RLS):

| Campo | CLIENTE | ASESOR | ADMINISTRADOR |
|---|---|---|---|
| `cliente.numero_documento` | Propio, completo | Enmascarado `****5678` en listas; completo solo en el caso asignado | Enmascarado; completo en detalle |
| `cliente.telefono` / `email` | Propio | Solo en casos de su cola | Sí |
| `simulacion.perfil.ingresoDiarioSoles` | Propio | No | Agregado en reportes, nunca individual |
| `parametros_comerciales.descuento_maximo` | No | Sí (lo necesita para negociar) | Sí |
| `registro_actividad.detalle` | No | No | Sí |
| `prima_cotizada.detalle_calculo` (desglose) | No | Sí (caso asignado) | Sí |
| `orden_compra.contenido_plan` (copia del plan comprado) | Propio | Caso asignado | Sí |

---

## 8. Flujos completos de extremo a extremo

### 8.1 CU-01 Cotizar y comparar
1. `GET /catalogo/campos` → unión de campos activos (RN-17). Las opciones de
   marca, modelo, año y ubigeo salen del catálogo de vehículos y de ubigeos
   (selectores en cascada).
2. Cliente completa, elige canal preferido.
3. `POST /cotizaciones` → validación contra catálogo (RF-03), nicho (RN-05),
   carga de la tarifa de cada aseguradora (caché), 5 estrategias en paralelo
   con timeout individual de 2 s (RNF-01) usando la suma inicial (punto medio
   del rango, RN-37), derivación, RPC `registrar_cotizacion`.
4. Respuesta: por plan, `resumen`, suma asegurada, rango, prima anual y prima
   mensual; opciones habilitadas, `tokenAcceso`, `warning` si alguna aseguradora no
   cotizó.
5. *(Opcional)* El cliente mueve la suma de una aseguradora:
   `PATCH /cotizaciones/:id/aseguradoras/:aseguradoraId/suma-asegurada` →
   recálculo de las 2 primas de esa aseguradora (RPC 6.13).

### 8.2 ★ Prueba de Choque (opcional, entre CU-01 y CU-02)
1. Pantalla de comparación muestra el botón "Pon a prueba estos planes".
2. Tres preguntas rápidas (cochera, km, uso nocturno) + ingreso diario si es
   uso comercial + "¿qué te preocupa más?" (chips).
3. `POST /cotizaciones/:id/prueba-choque` → dominio calcula → RPC
   `registrar_simulacion`.
4. Resultado: ranking por Costo Real Anual, tarjeta por escenario y la
   frase "peor caso del año".

### 8.3 CU-02 Compra autónoma
`GET /compras/:id/campos-faltantes` → `PUT /compras/:id/datos` →
`POST /compras` (el backend arma la copia del contenido del plan y llama a la RPC
`crear_orden_compra`, RN-45) → `POST /compras/:id/pago`
(pasarela + emisión simuladas + RPC `confirmar_compra` + PDF) →
`GET /polizas/:id/pdf`.

### 8.4 CU-03 Asesoría / descuento
`POST /asesorias` → cola → `tomar_solicitud` → `aplicar_descuento_negociado`
→ `cerrar_solicitud` → cliente completa la compra con prima negociada.

### 8.5 CU-04 Seguimiento / telemarketing
Detector horario → `seguimiento EN_SEGUIMIENTO` → intentos por canal
preferido → `ACEPTA` (compra atribuida a `TELEMARKETING`) o cierre
`DESCARTADO` con motivo → un mensaje final con enlace de retoma y resumen de
la Prueba de Choque (RN-35).

### 8.6 CU-05 Catálogo y reportes
Cambios vía RPC admin con rastro; reportes por periodo.

### 8.7 ★ CU-06 Ver detalle y comparar el contenido de los planes
1. En el comparativo, "Ver detalle" → `GET /planes/:planId/contenido`
   (descripción, ideal para, coberturas con ✓/✗ y detalle, exclusiones,
   requisitos). Panel con pestañas *Qué cubre*, *Qué no cubre*, *Requisitos*.
2. "Comparar" (hasta 3 planes) → `GET /planes/comparar?ids=…` → matriz
   cobertura × plan (18.4).
3. El administrador edita un plan con `PUT /admin/planes/:planId/contenido`
   (RPC `admin_guardar_plan_contenido`) y ve las advertencias RN-42/RN-43.

---

## 9. Migraciones planeadas (orden y contenido)

| # | Archivo | Contenido |
|---|---|---|
| 0001 | `0001_init_schema_enums.sql` | `create schema svas`, `pgcrypto`, los 19 tipos enum |
| 0002 | `0002_seguridad_usuarios.sql` | `usuario`, `tg_usuario_sync_rol`, helpers `svas.rol_actual()`, `svas.exigir_rol()` |
| 0003 | `0003_registro_actividad.sql` | Bitácora append-only |
| 0004 | `0004_catalogo.sql` | `parametros_comerciales`, `aseguradora`, `plan`, `campo_requerido` (con `origen_valores`), `valor_permitido`, `regla_inspeccion` + RLS |
| 0005 | `0005_catalogo_vehiculos_ubigeos.sql` ★ | `marca`, `tipo_vehiculo`, `modelo`, `ubigeo` + RLS (lectura para `authenticated`) |
| 0006 | `0006_tarifas.sql` ★ | `tarifa_plan`, `rango_suma_asegurada`, `peso_marca`, `peso_modelo`, `peso_anio`, `peso_tipo`, `peso_ubigeo`, vista `v_tarifa_completitud` + RLS (solo `ADMINISTRADOR`) |
| 0007 | `0007_clientes_vehiculos.sql` | `cliente`, `vehiculo` (con `modelo_id`), `ubicacion_uso` (con `ubigeo`) + RLS |
| 0008 | `0008_cotizaciones.sql` | `cotizacion`, `cotizacion_opcion`, `prima_cotizada` (con suma, prima mensual y desglose) + RLS |
| 0009 | `0009_asesoria_retencion.sql` | `solicitud_asesoria`, `seguimiento`, `intento_contacto`, `descuento` + T1, T2 + RLS |
| 0010 | `0010_compra_pagos_polizas.sql` | `orden_compra` (con `contenido_plan jsonb`), `pago`, `cuota`, `poliza` + T3, T4 + RLS |
| 0011 | `0011_prueba_choque.sql` ★ | 8 tablas de la sección 4.1 ★ (incluye `simulacion.vigente`; `zona_riesgo_distrito` con `ubigeo`) + RLS |
| 0012 | `0012_rpc_cotizacion.sql` | 6.1, 6.2, 6.13 |
| 0013 | `0013_rpc_compra.sql` | 6.3 (con `p_contenido_plan`), 6.4 (con `p_monto_total`), `registrar_pago_rechazado` |
| 0014 | `0014_rpc_asesoria_retencion.sql` | 6.5 a 6.11 |
| 0015 | `0015_rpc_administracion.sql` | 6.12 (incluye RPCs de tarifas) |
| 0016 | `0016_seed_catalogo.sql` | 1 parámetros, 5 aseguradoras, **10 planes (2 por aseguradora)**, 15 reglas de inspección, 22 campos, 6 valores (Práctica 2, 3.5.5) |
| 0017 | `0017_seed_vehiculos_tarifas.sql` ★ | 21 marcas, 5 tipos, 68 modelos, 73 ubigeos, 10 `tarifa_plan`, 4 080 rangos de suma, 105 `peso_marca`, 340 `peso_modelo`, 60 `peso_anio`, 5 `peso_tipo`, 73 `peso_ubigeo` (sección 17.10; datos **estimados**, RN-26) |
| 0018 | `0018_seed_prueba_choque.sql` ★ | 6 escenarios, coberturas de ejemplo por plan (coherentes con la matriz 18.4), 54 frecuencias (6 × 3 usos × 3 zonas), zonas de Lima Metropolitana y Callao (por `ubigeo`), 9 factores |
| 0019 | `0019_storage_buckets.sql` | Bucket privado `polizas` y su policy |
| 0020 | `0020_contenido_planes.sql` ★ | Columnas nuevas de `plan` (`resumen`, `ideal_para`, `orden`, `contenido_actualizado_en`); `cobertura`, `cobertura_escenario`, `plan_cobertura`, `plan_exclusion`, `plan_requisito`; vista `v_plan_contenido_completitud`; RPCs `admin_guardar_plan_contenido` y `admin_guardar_cobertura_catalogo`; reemplaza `admin_cambiar_estado_plan` para exigir contenido completo; RLS |
| 0021 | `0021_seed_contenido_planes.sql` ★ | 13 coberturas, 6 `cobertura_escenario`, 130 `plan_cobertura` (95 incluidas + 35 no), 70 `plan_exclusion`, 40 `plan_requisito`, resumen/descripción/ideal para de los 10 planes (sección 18; **ilustrativo**, RN-46) y verificación de RN-42/RN-43 |

Regla: una migración nunca se edita después de aplicarse en un entorno
compartido; se corrige con una nueva. Por eso el contenido comercial entra
como **0020 y 0021 al final**, sin renumerar las anteriores. Dos detalles:
`orden_compra.contenido_plan` ya nace en 0010 como `jsonb` (sin dependencia
de las tablas de contenido) y el seed 0018 de la Prueba de Choque se genera
**desde la matriz 18.4**, para que 0021 encuentre ya coherentes las dos
fuentes (RN-43).

---

## 10. Reportes y documentos requeridos

| Reporte / documento | Formato | Rol | Fuente |
|---|---|---|---|
| Póliza de demostración | PDF (Storage, URL firmada 10 min) | CLIENTE dueño | RF-25 |
| Cronograma de cuotas | Incluido en la póliza + JSON | CLIENTE | RF-23 |
| Ventas por canal, aseguradora y plan | JSON + PDF | ADMINISTRADOR | RF-30 |
| Embudo de retención (abiertos, intentos, convertidos, descartados por motivo) | JSON | ADMINISTRADOR; ASESOR (propio) | OE3 |
| Descuentos otorgados (por asesor, %, conversión) | JSON | ADMINISTRADOR | RN-07, P5 |
| ★ Impacto de la Prueba de Choque | JSON | ADMINISTRADOR | Sección 16.7 |
| ★ Resultado de la Prueba de Choque para el cliente | PDF de 1 página (compartible) | CLIENTE / anónimo con token | Sección 16 |
| Completitud de tarifas (qué modelo-año no tiene rango o peso, por aseguradora) | JSON | ADMINISTRADOR | Sección 17.9 |
| Completitud y coherencia del contenido de planes | JSON | ADMINISTRADOR | Sección 18.10 |
| Comparativo de coberturas entre planes | JSON + pantalla | CLIENTE / anónimo con token | Sección 18.4 |

---

## 11. Alertas y procesos automáticos

- **Detector de abandono** (cada hora, `@nestjs/schedule` + advisory lock
  de Postgres para que dos instancias no lo ejecuten a la vez): RPC 6.10.
- **Caducidad de seguimientos**: cada día cierra como `DESCARTADO /
  NO_RESPONDE` los seguimientos con más de `dias_seguimiento` sin
  conversión y dispara el mensaje final.
- **PDF pendiente**: cada 10 min regenera pólizas cuyo archivo no exista en
  Storage (si el PDF falló tras confirmar la compra; la compra no se revierte).
- **Solicitud estancada**: alerta al administrador si una solicitud lleva
  más de 4 h hábiles en `PENDIENTE`.
- ★ **Cobertura desactualizada**: alerta si una fila de
  `cobertura_plan_escenario` tiene `actualizado_en` mayor a 180 días.
- ★ **Tarifa incompleta o vieja**: alerta al administrador si
  `v_tarifa_completitud` muestra modelos-año sin rango o pesos faltantes, o si
  un `tarifa_plan.actualizado_en` supera los 180 días.
- ★ **Contenido de plan incompleto o desactualizado**: alerta diaria al
  administrador si `v_plan_contenido_completitud` muestra un plan activo con
  `completo = false` o `incoherencias_prueba_choque > 0`, o si
  `plan.contenido_actualizado_en` supera los 180 días.

---

## 12. Fuera de alcance (explícito)

Tarifas oficiales de las aseguradoras (las tasas, pesos y rangos del proyecto son **estimados** con fines académicos, RN-26); cobros reales y emisión vinculante; siniestros reales (la Prueba de Choque
**simula**, no gestiona siniestros); firma electrónica certificada; otros
ramos (salud, vida, hogar, SOAT); flotas > 5, pesados y carga; app móvil
nativa (queda abierta una PWA); reemplazo del asesor en casos complejos;
recomendación personalizada por IA que decida por el cliente (el
clasificador opcional de 16.6 solo traduce texto a escenarios).

---

## 13. Máquinas de estado por entidad (contrato para el frontend)

### 13.1 `cotizacion.estado`

| Estado | Significa | Acciones habilitadas en UI | Bloqueadas |
|---|---|---|---|
| `REGISTRADA` | Cotizada, sin compra | Ver comparativo, **ajustar suma asegurada**, Prueba de Choque, Opción 1/2 según `opciones`, editar contacto | — |
| `NO_CONCRETADA` | El detector la pasó a seguimiento | Comprar solo desde enlace de retoma o tras `ACEPTA`; Prueba de Choque (lectura); ajustar suma mientras no exista orden | Recotizar sobre la misma (crear una nueva) |
| `CONVERTIDA` | Tiene orden con pago confirmado | Ver póliza, ver pagos | Comprar de nuevo, solicitar asesoría, simular, **ajustar suma asegurada** |

Transiciones: `REGISTRADA → CONVERTIDA` (compra), `REGISTRADA →
NO_CONCRETADA` (detector), `NO_CONCRETADA → CONVERTIDA` (retoma o
telemarketing). No hay vuelta atrás.

### 13.2 `solicitud_asesoria.estado`

| Estado | UI asesor | UI cliente |
|---|---|---|
| `PENDIENTE` | Botón "Tomar caso" | "Un asesor te contactará por {canal}" + tiempo estimado |
| `EN_ATENCION` | Negociar descuento, registrar resultado | "Tu asesor {nombre} está revisando tu caso" |
| `CERRADA` | Solo lectura | Si aceptó: botón "Completar compra" con prima negociada |

### 13.3 `seguimiento.estado`

| Estado | UI asesor | Reglas visibles |
|---|---|---|
| `EN_SEGUIMIENTO` | Registrar intento (solo el canal preferido habilitado), cerrar con motivo | Contador "Intento 2 de 4 · quedan 5 días" |
| `CONVERTIDO` | Solo lectura | — |
| `DESCARTADO` | Solo lectura + motivo | "Mensaje final enviado el …" |

### 13.4 `pago.estado` y `cuota.estado`

| Estado | UI cliente |
|---|---|
| `PENDIENTE` | Spinner "Procesando pago…" (máx. 10 s en la simulación) |
| `CONFIRMADO` | Póliza disponible para descargar |
| `RECHAZADO` | Mensaje de error y botón "Intentar con otro medio" (crea un pago nuevo; la orden se conserva) |

### 13.5 ★ `simulacion_plan.datos_completos`

| Valor | UI |
|---|---|
| `true` | Muestra CRA y posición en el ranking |
| `false` | Badge "Información incompleta" + tooltip con los escenarios sin dato; nunca aparece como "Mejor protección" |

### 13.6 ★ `simulacion.vigente`

| Valor | UI |
|---|---|
| `true` | Se muestra normal |
| `false` | Banner "Cambiaste tu suma asegurada: vuelve a simular para ver tus costos reales" + botón "Volver a simular"; el resultado anterior se muestra atenuado (RN-37) |

---

## 14. Matriz de permisos de UI por pantalla (rol × pantalla × acción)

| Pantalla | Anónimo | CLIENTE | ASESOR | ADMINISTRADOR |
|---|---|---|---|---|
| Landing / Cotizar | ✅ | ✅ | ❌ | ✅ (modo prueba) |
| Comparativo de planes | ✅ (con token) | ✅ | ❌ | ✅ |
| Ajustar suma asegurada (control en la tarjeta de cada aseguradora) | ✅ (con token) | ✅ | ❌ | ✅ |
| ★ Prueba de Choque | ✅ (con token) | ✅ | ✅ lectura (desde el caso) | ✅ |
| Compra (datos, firma, pago) | Registro requerido | ✅ | ❌ | ❌ |
| Confirmación y póliza | ❌ | ✅ | ❌ | ❌ |
| Mis cotizaciones / pólizas / pagos | ❌ | ✅ | ❌ | ❌ |
| Retoma (enlace) | ✅ | ✅ | ❌ | ❌ |
| Dashboard | ❌ | ❌ | ✅ (su cola) | ✅ (completo) |
| Cola de asesoría | ❌ | ❌ | ✅ atender | ✅ lectura |
| Detalle de caso + negociación | ❌ | ❌ | ✅ | ✅ lectura |
| Seguimiento / retención | ❌ | ❌ | ✅ | ✅ lectura |
| Aseguradoras y planes | ❌ | ❌ | ❌ | ✅ CRUD (activar/desactivar) |
| Campos requeridos | ❌ | ❌ | ❌ | ✅ CRUD |
| Reglas de inspección | ❌ | ❌ | ❌ | ✅ |
| Parámetros comerciales | ❌ | ❌ | ❌ | ✅ |
| Tarifas por aseguradora (tasas, pesos, rangos de suma) | ❌ | ❌ | ❌ | ✅ |
| Simulador de tarifa (con desglose) | ❌ | ❌ | ❌ | ✅ |
| Detalle del plan (qué cubre / no cubre / requisitos) | ✅ (con token) | ✅ | ✅ lectura | ✅ |
| Comparar planes lado a lado | ✅ (con token) | ✅ | ❌ | ✅ |
| Contenido de planes (coberturas, exclusiones, requisitos) | ❌ | ❌ | ❌ | ✅ CRUD |
| ★ Reglas de Prueba de Choque | ❌ | ❌ | ❌ | ✅ |
| Reportes | ❌ | ❌ | ✅ (propio) | ✅ todos |
| Usuarios y roles | ❌ | ❌ | ❌ | ✅ |
| Bitácora | ❌ | ❌ | ❌ | ✅ lectura |

> **Regla de UI**: lo marcado ❌ no aparece en el menú — oculto, no
> deshabilitado.

---

## 15. Validaciones de negocio en UI (regla → mensaje → pantalla)

| Regla | Mensaje al usuario | Pantalla | Nivel |
|---|---|---|---|
| RF-03 campo obligatorio | "Pacífico necesita el distrito para cotizarte" | Cotizar | Optimista (zod) + error por campo del backend |
| RN-05 fuera de nicho | "Por ahora atendemos hasta 5 vehículos de uso comercial ligero. Escríbenos para flotas." | Cotizar | Error |
| RF-05 aseguradora sin cotización | "Qualitas no pudo cotizar este vehículo; te mostramos las demás." | Comparativo | Warning no bloqueante |
| RN-03 inspección | "Este uso requiere una inspección. Un asesor te contactará por {canal} con tus datos ya cargados." | Comparativo (Opción 1 oculta) | Informativo |
| RN-04 no asegurable | "No podemos cotizarlo en línea. Ya lo pasamos a un asesor, no necesitas escribir un correo." | Comparativo | Informativo |
| RN-08 primera compra | "Se aplicó tu 5 % de descuento por primera compra." | Resumen de compra | Informativo |
| RN-07 tope | Input de % con `max = descuento_maximo` | Negociación (asesor) | Optimista |
| RN-10 máx. intentos | Botón deshabilitado + "Se alcanzó el máximo de 4 intentos" | Seguimiento | Optimista |
| RN-10 canal | Solo el canal preferido aparece habilitado | Seguimiento | Optimista |
| RN-11 motivo | Select de motivo obligatorio | Cierre de seguimiento | Optimista |
| RN-12 enlace vencido | "Este enlace venció. Puedes cotizar de nuevo en 1 minuto." | Retoma | Error |
| 6.5 caso ya tomado | "Otro asesor tomó este caso." | Cola | Error 409 |
| ★ RN-29 | Leyenda fija bajo el ranking | Prueba de Choque | Informativo |
| ★ RN-30 | "Sin información de este plan para robo total" | Prueba de Choque | Warning |
| ★ RN-33 | Campo "¿Cuánto ganas al día?" visible solo si uso comercial | Prueba de Choque | Optimista |
| RN-37 suma fuera de rango | "La suma asegurada de {aseguradora} debe estar entre USD {mín} y USD {máx}." | Comparativo | Optimista (control con `min`/`max`) + error 400 |
| RN-39 modelo/año sin rango | "{aseguradora} no cotiza este vehículo; te mostramos las demás." | Comparativo | Warning no bloqueante |
| RN-37 simulación desactualizada | "Cambiaste tu suma asegurada. Vuelve a simular para ver tus costos reales." | Prueba de Choque | Warning |
| RN-38 recargo por cuotas | "Pagar en cuotas tiene un recargo de {x} % en {aseguradora}." | Compra (modo de pago) | Informativo |
| Suma bloqueada | "Ya iniciaste tu compra: la suma asegurada ya no se puede cambiar." | Comparativo | Error 409 |
| RN-42 plan incompleto | "No puedes activar este plan: faltan {n} coberturas por definir." | Admin · contenido del plan | Error 400 |
| RN-43 incoherencia | "«{cobertura}» dice que sí, pero la Prueba de Choque dice que no. Corrige una de las dos." | Admin · contenido del plan | Warning |
| RN-45 contenido contratado | "Este es el contenido del plan que contrataste el {fecha}." | Confirmación y póliza | Informativo |
| RN-46 leyenda | "Contenido ilustrativo; no es el condicionado de la aseguradora." | Detalle del plan, comparador, póliza | Informativo |

---

## 16. Funcionalidad diferencial: Prueba de Choque

### 16.1 Por qué esta y no otra

La compra autónoma resuelve un problema operativo, pero no es visible para
el cliente como algo nuevo: Rímac, Pacífico y Mapfre ya venden 100 % en
línea (Práctica 1, 6.2). Todos los comparadores ordenan por **prima**, y el
cliente elige el más barato sin entender que su deducible puede costarle más
que la diferencia de precio en el primer incidente. La Prueba de Choque
ataca exactamente eso:

| Lo que hace hoy el mercado | Lo que hace SeguroSimple con la Prueba de Choque |
|---|---|
| Ordena por prima | Ordena por **Costo Real Anual** (prima + desembolso esperado) |
| Muestra coberturas como lista de "✓ Robo total" | Muestra **cuánto pagas tú** en cada escenario, en dinero |
| Ignora que el taxista deja de trabajar | Calcula **días sin trabajar** y su costo (Segmento B) |
| Seguimiento = llamadas insistentes (P4) | El mensaje de retención lleva **un dato útil y personal** (RN-35) |
| El asesor negocia a ciegas | El asesor ve qué escenario le preocupa al cliente |

No se encontró en las fuentes revisadas de la Práctica 1 (6.2) un
comparador peruano que muestre desembolso por escenario. Además conecta con
los tres problemas más costosos del AS-IS: abandono (P6), seguimiento
inútil (P4) y descuentos a ciegas (P5).

### 16.2 Escenarios iniciales (valores referenciales a validar, RN-31)

| Código | Descripción para el cliente | Daño ref. (USD) | Días de taller |
|---|---|---|---|
| `CHOQUE_LEVE` | Raspas el parachoques al estacionar | 600 | 3 |
| `CHOQUE_FUERTE` | Choque con daño en carrocería y faros | 3 500 | 12 |
| `ROBO_AUTOPARTES` | Te roban espejos, faros o logo en la calle | 900 | 2 |
| `ROBO_TOTAL` | Se llevan el auto | Suma asegurada del plan | 30 |
| `DANO_TERCEROS` | Dañas otro auto o una propiedad | 2 500 | 0 |
| `PERDIDA_TOTAL` | El auto no se puede reparar | Suma asegurada del plan | 30 |

`ROBO_TOTAL` y `PERDIDA_TOTAL` usan como daño la **suma asegurada** de la
prima cotizada de cada plan (`prima_cotizada.suma_asegurada`): es el valor que
el cliente ya eligió dentro del rango de esa aseguradora, por lo que ya no hace
falta una tabla de depreciación aparte (su `monto_dano_referencial` queda en
`NULL`). Consecuencia: el daño de esos dos escenarios puede diferir entre
aseguradoras (cada una tiene su rango) y cambia si el cliente mueve su suma
(RN-37: la simulación previa queda `vigente = false`).

### 16.3 Algoritmo (función pura del dominio)

Para cada plan *p* con prima disponible y cada escenario activo *e*:

```
D   = monto de daño de e        (ROBO_TOTAL / PERDIDA_TOTAL: D = suma_asegurada de la prima del plan)
pe  = frecuencia(e, uso, zona) × Π factores del perfil      (acotada a 0,95)
si no hay regla(p, e):         sinDato = true; se excluye del CRA (RN-30)
si regla.cubre = false:        pago = D
si regla.cubre = true:
    deducible = min(D, max(D × pct, minimo))
    exceso    = tope ? max(0, D − tope) : 0
    pago      = deducible + exceso
ingresoPerdido = uso comercial y ingresoDiario declarado
                 ? ingresoDiario × max(0, diasTaller(e) − diasReemplazo(p,e))
                 : 0                                         (RN-33)
desembolso(p,e) = pago + ingresoPerdido
CRA(p)       = prima(p) + Σe pe × desembolso(p,e)
peorCaso(p)  = max e desembolso(p,e)
ranking      = orden por CRA, luego prima; incompletos al final (RN-34)
```

Ejemplo ilustrativo (valores inventados): plan A prima 480, deducible 15 %
mín. 300 en robo de autopartes; plan B prima 560, deducible 10 % mín. 150.
Zona ALTA, sin cochera: el robo de autopartes pasa de p = 0,12 a 0,18. En
ese escenario A desembolsa 300 y B 150; si los demás escenarios son
similares, B queda primero en CRA aunque su prima es 80 más cara.

### 16.4 Pantalla (resumen; detalle en el doc frontend)

- Cabecera: "Si este año te pasa algo, ¿cuánto pagarías tú?"
- Ranking de planes con barra apilada: prima + desembolso esperado.
- Matriz plan × escenario con montos en el bolsillo del cliente,
  coloreados por nivel (bajo / medio / alto).
- "Peor caso del año" por plan.
- Para Segmento B: fila extra "Días sin trabajar" y su costo.
- Botones: "Comprar este plan" (Opción 1) / "Hablar con un asesor sobre
  esto" (Opción 2 con motivo `DUDA` y la simulación adjunta al caso).
- Compartir: PDF de una página (útil para quien decide en familia).

### 16.5 Integración con módulos existentes

| Módulo | Qué cambia |
|---|---|
| `cotizacion` | Ninguna regla cambia (RN-28); expone primas al motor |
| `asesoria-retencion` | El detalle de caso muestra la simulación; el mensaje final incluye la frase de contraste (RN-35) |
| `administracion` | Nuevas pantallas para escenarios, coberturas, frecuencias, zonas y factores |
| `reportes` | Nuevo reporte de impacto (16.7) |
| `integracion` | Puerto opcional `ClasificadorPreocupaciones` |

### 16.6 Extensión opcional: "Cuéntanos qué te preocupa"

Campo de texto libre ("dejo el carro en la calle en Los Olivos y trabajo de
noche con InDrive"). Puerto `ClasificadorPreocupaciones` con dos
adaptadores: `ClasificadorPorPalabrasClave` (por defecto, sin costo) y
`ClasificadorLLM` (opcional, detrás de feature flag, devuelve solo códigos
de escenario y variables de perfil en JSON validado con zod). El texto no se
guarda; solo el resultado clasificado (RN-36).

### 16.7 Métricas de impacto (reporte)

- % de cotizaciones con simulación.
- Conversión con simulación vs sin simulación.
- % de compras de un plan distinto al de menor prima tras simular.
- Escenario más elegido como "preocupación" por segmento y zona.
- Conversión de seguimientos cuyo mensaje final incluyó RN-35 vs los que no.

### 16.8 Requisitos nuevos (para agregar a la Práctica 3)

| ID | Requisito | Prior. |
|---|---|---|
| RF-34 | El sistema simula, por plan cotizado, el desembolso del cliente en los escenarios de siniestro activos y calcula el Costo Real Anual. | 4 |
| RF-35 | El cliente declara un perfil breve (cochera, km, uso nocturno, ingreso diario si es comercial) que ajusta la simulación. | 3 |
| RF-36 | El administrador mantiene escenarios, coberturas por plan, frecuencias por uso y zona, zonas por distrito y factores de perfil. | 3 |
| RF-37 | El mensaje final de retención incluye el resumen de la simulación si existe. | 2 |
| RF-38 | El sistema reporta el impacto de la simulación en la conversión. | 2 |
| RNF-21 | La simulación responde en ≤ 1 s (p95) para 5 aseguradoras × 6 escenarios. | — |
| RNF-22 | El motor de simulación tiene cobertura de pruebas ≥ 90 % (función pura). | — |


---

## 17. Tarifas y cálculo de primas por aseguradora

> Esta sección explica **de dónde sale cada prima**. Está pensada para poder
> defender el diseño en clase: qué tablas hay, qué hace cada una, qué fórmula
> usa cada aseguradora y por qué se usa el patrón Strategy. Todos los números
> del proyecto (tasas, pesos, rangos) son **estimados** (RN-26): sirven para
> demostrar el funcionamiento, **no** son las tarifas reales de Rímac,
> Pacífico, La Positiva, Mapfre ni Qualitas. Los nombres de plan de Rímac
> (Plata y Oro) son los del negocio; los de las otras cuatro aseguradoras son
> **provisionales** y se cambian editando la tabla `plan`.

### 17.1 La idea en 30 segundos

1. El cliente indica el vehículo (marca, modelo, año), su ubicación (ubigeo)
   y, si quiere, cambia la **suma asegurada** dentro del rango que permite
   cada aseguradora.
2. Cada aseguradora tiene **2 planes**. Para cada plan, su **Estrategia** hace
   una cuenta distinta con **sus** tablas de tarifa.
3. El resultado, por plan, es una **prima anual** y una **prima mensual** (12
   cuotas). Si el cliente mueve la suma, la prima cambia.

```
 vehículo (modelo_id + año) · ubigeo · suma asegurada
                    │
                    ▼
 EstrategiaRimac      ──lee──►  rango_suma_asegurada · tarifa_plan · peso_marca · peso_modelo · peso_anio
 EstrategiaPacifico   ──lee──►  (igual) + peso_ubigeo
 EstrategiaLaPositiva ──lee──►  (igual) + peso_tipo
 EstrategiaMapfre     ──lee──►  rango_suma_asegurada · tarifa_plan · peso_marca · peso_modelo · peso_anio
 EstrategiaQualitas   ──lee──►  (igual que Mapfre)
                    │
                    ▼
 prima anual + prima mensual (por plan) ──► prima_cotizada (+ detalle_calculo)
```

### 17.2 Quién guarda qué: datos en tablas, fórmula en código

| Pregunta | Es un… | Dónde vive |
|---|---|---|
| ¿Cuánto más caro es un BMW que la base? | dato | `peso_marca` |
| ¿Cuánto cobra el plan Oro en total? | dato | `tarifa_plan.tasa_base` |
| ¿Qué suma puede elegir el cliente para un Corolla 2022? | dato | `rango_suma_asegurada` |
| ¿Cómo se combinan los pesos (multiplicar, promediar)? | **fórmula** | clase `Estrategia…` (TypeScript) |
| ¿Hay piso mínimo, cargo fijo, recargo o descuento? | dato + fórmula | `tarifa_plan.parametros` + la clase |

Así, el administrador cambia un peso desde el panel **sin desplegar código**,
y el programador cambia una fórmula **sin tocar los datos** (RN-40). Además la
fórmula se prueba con tests unitarios sin base de datos.

### 17.3 Las tablas, una por una (con filas reales de ejemplo)

Caso de ejemplo en todo este capítulo: **Toyota Corolla 2022 (Sedán),
ubicado en Miraflores (ubigeo `150122`)**.

**`rango_suma_asegurada`** — qué suma puede elegir el cliente y si la
aseguradora cotiza el vehículo (la fila existe o no):

| Aseguradora | Modelo | Año | `suma_minima` | `suma_maxima` |
|---|---|---|---|---|
| Rímac | Corolla | 2022 | 12 000,00 | 16 800,00 |
| Pacífico | Corolla | 2022 | 12 700,00 | 16 500,00 |
| La Positiva | Corolla | 2022 | 12 300,00 | 16 200,00 |
| Mapfre | Corolla | 2022 | 12 400,00 | 16 500,00 |
| Qualitas | Corolla | 2022 | 11 700,00 | 15 700,00 |

**`tarifa_plan`** — tasa base y parámetros propios de cada plan:

| Aseguradora | Plan | `tasa_base` | `parametros` |
|---|---|---|---|
| Rímac | Plata | 0,0300 | `{}` |
| Rímac | Oro | 0,0420 | `{}` |
| Pacífico | Básico | 0,0280 | `{"cargo_fijo_anual": 30}` |
| Pacífico | Premium | 0,0400 | `{"cargo_fijo_anual": 45}` |
| La Positiva | Clásico | 0,0300 | `{"recargo_pago_mensual": 0.05}` |
| La Positiva | Full | 0,0430 | `{"recargo_pago_mensual": 0.05}` |
| Mapfre | Esencial | 0,0290 | `{"prima_minima_anual": 180}` |
| Mapfre | Total | 0,0410 | `{"prima_minima_anual": 250}` |
| Qualitas | Estándar | 0,0310 | `{"descuento_comercial": 0.05}` |
| Qualitas | Plus | 0,0440 | `{"descuento_comercial": 0.05}` |

**Las tablas de peso** — la misma fila de datos (Corolla 2022, Miraflores)
mirada por cada aseguradora. Fíjate que **cada una pesa distinto el mismo
auto** y que no todas usan todas las tablas ("—" = esa aseguradora no usa esa
tabla):

| Aseguradora | `peso_marca` (Toyota) | `peso_modelo` (Corolla) | `peso_anio` (2022) | `peso_tipo` (Sedán) | `peso_ubigeo` (Miraflores) |
|---|---|---|---|---|---|
| Rímac | 0,950 | 1,000 | 1,070 | — | — |
| Pacífico | 0,970 | 1,000 | 1,000 | — | 0,980 |
| La Positiva | 0,960 | 1,020 | 1,032 | 1,000 | — |
| Mapfre | 0,960 | 1,000 | 1,034 | — | — |
| Qualitas | 1,000 | 1,020 | 1,020 | — | — |

Regla práctica para leer un peso: **menor que 1 = descuento, mayor que 1 =
recargo**. El año pesa más cuanto más antiguo es el auto (un 2015 pesa más
que un 2026); las marcas de lujo y los modelos más robados pesan más.

### 17.4 Qué usa cada aseguradora (resumen)

| | Rímac | Pacífico | La Positiva | Mapfre | Qualitas |
|---|---|---|---|---|---|
| Planes (provisionales salvo Rímac) | Plata / Oro | Básico / Premium | Clásico / Full | Esencial / Total | Estándar / Plus |
| Pesos que usa | marca, modelo, año | marca, modelo, año, **ubigeo** | marca, modelo, año, **tipo** | marca, modelo, año | marca, modelo, año |
| Cómo combina los pesos | producto | producto | producto | producto | **promedio** |
| Parámetro propio del plan | — | cargo fijo (30 / 45) | recargo mensual 5 % | **prima mínima** (180 / 250) | descuento 5 % |
| Prima mensual | anual ÷ 12 | anual ÷ 12 | anual × 1,05 ÷ 12 | anual ÷ 12 | anual ÷ 12 |
| Qué enseña del patrón | el caso base | un factor más y un cargo fijo | otro factor y un recargo que cambia el fraccionamiento | una regla de piso (`MAX`) | otra forma de combinar (promedio) y un descuento |

### 17.5 Las cinco fórmulas

Notación: **S** = suma asegurada, **tb** = tasa base del plan, **wM, wMo, wA,
wT, wU** = pesos de marca, modelo, año, tipo y ubigeo. Todos los montos se
redondean a 2 decimales (half-up) con `decimal.js`.

**Rímac** — la fórmula base, un producto de factores.
```
tasa        = tb × wM × wMo × wA
prima_anual = S × tasa
mensual     = prima_anual ÷ 12
```
Corolla 2022, plan Oro, S = 15 000: tasa = 0,042 × 0,95 × 1,00 × 1,07 =
0,042693 → prima = 15 000 × 0,042693 = **640,40** → mensual **53,37**.

**Pacífico** — suma el **ubigeo** y un **cargo fijo** por póliza.
```
tasa        = tb × wM × wMo × wA × wU
prima_anual = S × tasa + cargo_fijo_anual
mensual     = prima_anual ÷ 12
```
Plan Premium, Miraflores (wU = 0,98), S = 15 000: tasa = 0,040 × 0,97 × 1,00
× 1,000 × 0,98 = 0,038024 → 15 000 × 0,038024 = 570,36 + 45 = **615,36** →
mensual **51,28**.

**La Positiva** — suma el **tipo de vehículo** y cobra un **recargo si paga
en cuotas**.
```
tasa            = tb × wM × wMo × wA × wT
prima_anual     = S × tasa
total_en_cuotas = prima_anual × (1 + recargo_pago_mensual)
mensual         = total_en_cuotas ÷ 12
```
Plan Full, S = 15 000: tasa = 0,043 × 0,96 × 1,02 × 1,032 × 1,00 = 0,043453
→ prima = **651,79**; total en cuotas = 651,79 × 1,05 = 684,38 → mensual
**57,03** (12 × 57,03 = 684,36: la última cuota es 57,05 y absorbe los 2
céntimos de redondeo).

**Mapfre** — tiene un **piso**: la prima nunca baja de la prima mínima del
plan.
```
tasa        = tb × wM × wMo × wA
calculada   = S × tasa
prima_anual = MAX( calculada , prima_minima_anual )
mensual     = prima_anual ÷ 12
```
Plan Total, S = 15 000: tasa = 0,041 × 0,96 × 1,00 × 1,034 = 0,040698 →
calculada = **610,47** (supera el piso de 250) → mensual **50,87**.
*Cuando el piso manda* (un auto barato y viejo): Kia Picanto 2015, plan
Esencial, S = 3 000 → calculada = 102,58 < 180 → prima = **180,00**. En ese
auto, toda suma entre 2 600 y 3 400 da la misma prima de 180,00 (prima
"plana": mover el control no cambia el precio).

**Qualitas** — **promedia** los pesos en vez de multiplicarlos y aplica un
**descuento comercial**.
```
peso_vehiculo = (wM + wMo + wA) ÷ 3
prima_anual   = S × tb × peso_vehiculo × (1 − descuento_comercial)
mensual       = prima_anual ÷ 12
```
Plan Plus, S = 15 000: peso_vehiculo = (1,00 + 1,02 + 1,02) ÷ 3 = 1,013333 →
15 000 × 0,044 × 1,013333 × 0,95 = **635,36** → mensual **52,95**.

### 17.6 Las cinco aseguradoras frente al mismo auto

Toyota Corolla 2022, Miraflores, **S = USD 15 000** en todas (está dentro de
los cinco rangos):

| Aseguradora | Plan | Prima anual | Prima mensual (12 cuotas) |
|---|---|---|---|
| Rímac | Plata | 457,43 | 38,12 |
| Rímac | Oro | 640,40 | 53,37 |
| Pacífico | Básico | 429,25 | 35,77 |
| Pacífico | Premium | 615,36 | 51,28 |
| La Positiva | Clásico | 454,74 | 39,79 |
| La Positiva | Full | 651,79 | 57,03 |
| Mapfre | Esencial | 431,80 | 35,98 |
| Mapfre | Total | 610,47 | 50,87 |
| Qualitas | Estándar | 447,64 | 37,30 |
| Qualitas | Plus | 635,36 | 52,95 |

Lectura: los planes "altos" cuestan alrededor de 610–650 al año y los "bajos"
alrededor de 430–460; La Positiva es la única donde la cuota mensual × 12
supera a la prima anual (por el recargo). **Esta tabla es el caso de prueba
dorado** de las 5 estrategias (backend 3.6.1) y del smoke test del despliegue.

### 17.7 Suma asegurada inicial y cambio de suma

**Suma inicial.** Al cotizar, cada aseguradora recibe como suma el **punto
medio de su rango redondeado a múltiplos de USD 100**. Para el mismo auto:
Rímac 14 400 · Pacífico 14 600 · La Positiva 14 300 · Mapfre 14 500 ·
Qualitas 13 700. Con esas sumas, por ejemplo, Rímac da Plata 439,13 (36,59/mes)
y Oro 614,78 (51,23/mes).

**Cambio de suma** (el cliente mueve el control de una aseguradora):

1. El frontend envía la suma elegida de **esa** aseguradora (no calcula nada).
2. El backend valida que esté dentro del rango (RN-37) y recalcula con la
   Estrategia las **2 primas** de esa aseguradora. Las demás no se tocan.
3. El RPC 6.13 guarda la nueva suma, prima, prima mensual y desglose, y marca
   como no vigentes las simulaciones de la Prueba de Choque.
4. Se bloquea si la cotización ya tiene orden de compra o está convertida.

Efecto de la suma en Rímac Oro (Corolla 2022): la prima es proporcional.

| Suma asegurada | Prima anual | Prima mensual |
|---|---|---|
| 12 000 (mínima) | 512,32 | 42,69 |
| 13 000 | 555,01 | 46,25 |
| 15 000 | 640,40 | 53,37 |
| 16 800 (máxima) | 717,24 | 59,77 |

En Mapfre, en cambio, mientras la prima calculada esté bajo la prima mínima,
la suma **no** cambia el precio (17.5). Es un buen ejemplo de por qué la
fórmula no puede estar en el frontend.

### 17.8 Pago mensual por un año (fraccionamiento)

- En el comparativo, el precio que se destaca es la **prima mensual**
  ("USD 53 al mes"); la anual aparece como dato secundario.
- Elegir 12 cuotas en la compra equivale a `modo = CUOTAS`,
  `numero_cuotas = 12` (el máximo de `parametros_comerciales.max_cuotas`).
- **Descuento y cuotas.** El descuento se aplica primero sobre la prima anual
  (`prima_final = prima × (1 − d)`) y **después** se fracciona con la regla de
  la aseguradora: `total_a_pagar = Estrategia.totalEnCuotas(prima_final)` y
  `cuota = total ÷ n` (la última absorbe el redondeo). En pago único,
  `total_a_pagar = prima_final` (sin recargo).
- Ejemplo La Positiva Full con el 5 % de primera compra: prima 651,79 →
  prima_final 619,20 → total en cuotas 619,20 × 1,05 = 650,16 → **54,18 al
  mes**. Pagando al contado serían 619,20.
- `pago.monto` guarda `total_a_pagar` (RN-38), por eso puede superar a
  `orden_compra.prima_final` en `CUOTAS`.

### 17.9 Cuándo una aseguradora no cotiza (RN-39)

| Situación | Resultado | Qué ve el cliente |
|---|---|---|
| No existe `rango_suma_asegurada` para (aseguradora, modelo, año) | `disponible = false`, motivo `SIN_RANGO` | Tarjeta gris "No disponible" + toast: "{aseguradora} no cotiza este vehículo" |
| Hay rango pero falta un peso obligatorio (marca, modelo, año o tipo) | `disponible = false`, motivo `PESO_FALTANTE` | Igual que arriba; además alerta al administrador |
| Falta el peso de **ubigeo** (solo Pacífico) | Cotiza con peso 1,00; el desglose anota `ubigeoPorDefecto: true` | Nada: se cotiza normal |
| La suma enviada está fuera del rango | **Error 400** (no es "no disponible": es un dato de entrada inválido) | Mensaje con el rango permitido |
| La Estrategia falla o excede 2 s | `disponible = false`, motivo `ERROR_ESTRATEGIA` | Toast RF-05; las demás se muestran |
| Ninguna aseguradora queda disponible | RN-04: solo `ASESORIA`, motivo `NO_ASEGURABLE` | "No podemos cotizarlo en línea. Ya lo pasamos a un asesor." |

La vista `v_tarifa_completitud` lista, por aseguradora, los modelos-año que
tienen rango pero les falta algún peso, y los modelos-año del catálogo sin
rango: es la herramienta del administrador para completar la tarifa.

### 17.10 De dónde salieron los datos (Excel → tablas)

El Excel de trabajo `base_vehiculos_aseguradoras.xlsx` tiene los datos
**desnormalizados** (el peso de Toyota se repite en cada fila Toyota). Al
cargarlos a la base se guarda cada peso **una sola vez**:

| Hoja del Excel | Tablas que alimenta | Filas |
|---|---|---|
| `Base` (marca, modelo, año, tipo, suma mín/máx por compañía) | `marca` 21 · `tipo_vehiculo` 5 · `modelo` 68 · `rango_suma_asegurada` | 816 × 5 compañías = **4 080** |
| `Pesos Rimac`, `Pesos Pacífico`, `Pesos La Positiva`, `Pesos Mapfre`, `Pesos Qualitas` | `peso_marca`, `peso_modelo`, `peso_anio` (y `peso_tipo` solo La Positiva) | 21 + 68 + 12 por aseguradora → 105, 340 y 60 filas; `peso_tipo` 5 |
| `Ubigeo Pacífico` | `ubigeo` · `peso_ubigeo` | 73 + 73 (Lima 43 distritos, Callao 7 y 23 capitales de departamento) |
| `Planes Rimac`, `Planes Pacífico`, `Planes La Positiva`, `Planes Mapfre`, `Planes Qualitas` | `plan` + `tarifa_plan` | 10 + 10 |

El script de seed (migración 0017) **verifica la consistencia** antes de
insertar: todas las filas del Excel con la misma marca deben traer el mismo
peso de marca (idem modelo y año); si no, aborta.

### 17.11 Agregar una aseguradora nueva (principio abierto/cerrado)

1. Crear la fila en `aseguradora` (con su `codigo_estrategia`), sus planes en
   `plan` y su `tarifa_plan` (tasa base y `parametros`).
2. Cargar `rango_suma_asegurada` y **solo** las tablas `peso_*` que su fórmula
   use (el administrador, con carga masiva).
3. Escribir la clase `EstrategiaNueva` (una fórmula, ~15 líneas) y registrarla
   en el `EstrategiaRegistry`.
4. Si pide un dato extra al cliente, agregar el `campo_requerido`.
5. Agregar su caso a la tabla de pruebas.

**No se toca**: el caso de uso de cotizar, los controladores, las otras
estrategias ni el frontend (el formulario y las tarjetas salen del catálogo y
de la respuesta).

### 17.12 Preguntas típicas de defensa

- **¿Por qué las fórmulas no están en SQL?** Porque se prueban sin base de
  datos, se versionan con el código, el curso exige Strategy y, cuando exista
  la API real de una aseguradora, se reemplaza solo la clase (RNF-15).
- **¿Por qué los pesos están en tablas separadas y no en una sola hoja
  plana?** Porque cada peso se guarda una vez, tiene clave foránea (no se puede
  pesar un modelo que no existe) y el administrador lo edita en un solo lugar.
- **¿Por qué `peso_modelo` y `peso_tipo` coexisten en La Positiva?** El tipo
  es una categoría amplia (SUV, Pickup…) y el modelo afina dentro de ella;
  para no contar dos veces lo mismo, el `peso_modelo` de La Positiva queda en
  1,00 salvo ajustes puntuales.
- **¿Por qué el cliente no ve los pesos ni la tasa?** Son información
  comercial: el cliente recibe suma, rango y primas; el desglose solo lo ven
  el asesor del caso y el administrador (RN-41).
- **¿Y si una aseguradora cambia su tasa?** El administrador la edita
  (`admin_guardar_tarifa_plan`, con rastro). Las cotizaciones ya hechas **no
  cambian** porque guardan su desglose (RN-41); las nuevas usan la tasa nueva.
- **¿Por qué la suma asegurada es por aseguradora y no una sola?** Porque cada
  aseguradora valúa el vehículo con su propio rango (17.3); cambiar la suma de
  una no puede alterar las demás.

---

## 18. Contenido comercial de cada plan (qué cubre, qué no cubre, requisitos y descripción)

> Esta sección explica **qué le decimos al cliente sobre cada plan**: para
> quién es, qué cubre, qué **no** cubre y qué necesita para contratarlo. Es la
> contraparte "cualitativa" de la sección 17 (que explica cuánto cuesta). Como
> en la 17, todo el contenido es **ilustrativo** (RN-26 y RN-46): sirve para
> demostrar el sistema y **no** es el condicionado real de Rímac, Pacífico, La
> Positiva, Mapfre ni Qualitas. Los nombres de plan distintos de Plata y Oro
> son provisionales y se cambian editando la tabla `plan`.

### 18.1 La idea en 30 segundos

Cada **plan** (no cada aseguradora) tiene su propio contenido, guardado en
tablas, en cuatro partes:

1. **Descripción**: `plan.resumen` (una línea para la tarjeta), `plan.descripcion`
   (2–4 oraciones) y `plan.ideal_para` ("ideal para…").
2. **Qué cubre y qué no cubre**: una lista **común a todas las aseguradoras**
   (`cobertura`, 13 filas) y, por plan, un **sí o no** por cada cobertura
   (`plan_cobertura`). Un "no" es una fila explícita con `incluida = false`,
   nunca una ausencia (RN-42). Eso permite **comparar** planes de distintas
   aseguradoras fila contra fila.
3. **Otras exclusiones**: lo que ningún plan cubre aunque la cobertura exista
   (conducir ebrio, uso distinto al declarado…) → `plan_exclusion`.
4. **Requisitos**: qué necesita el cliente y su vehículo para contratar
   → `plan_requisito`.

Nada de esto afecta la prima: la prima sale de las tablas de la sección 17.
Estas tablas solo **explican** el plan, y se congelan en la orden de compra
(RN-45) para que lo que el cliente vio sea lo que contrató.

### 18.2 Qué tabla responde cada pregunta del cliente

| Pregunta del cliente | Dónde está la respuesta |
|---|---|
| ¿Qué es este plan? | `plan.resumen` y `plan.descripcion` |
| ¿Para quién es? | `plan.ideal_para` |
| ¿Qué cubre? | `plan_cobertura` con `incluida = true` (y su `detalle`, p. ej. "Hasta USD 100,000") |
| ¿Qué NO cubre? | `plan_cobertura` con `incluida = false` **+** `plan_exclusion` |
| ¿Qué necesito para contratarlo? | `plan_requisito` |
| ¿Cuánto pago yo cuando pasa algo? | `cobertura_plan_escenario` (Prueba de Choque, sección 16) |
| ¿Cuánto cuesta? | `tarifa_plan` y pesos (sección 17) |

### 18.3 El catálogo de coberturas (13 filas, iguales para las 5 aseguradoras)

| Código | Cobertura | Categoría | Escenario de la Prueba de Choque (RN-43) |
|---|---|---|---|
| `DANO_CHOQUE` | Daño propio por choque o vuelco | `DANOS_PROPIOS` | `CHOQUE_LEVE`, `CHOQUE_FUERTE`, `PERDIDA_TOTAL` |
| `INCENDIO` | Incendio y explosión | `DANOS_PROPIOS` | — |
| `DESASTRES` | Desastres naturales (sismo, inundación, huaico) | `DANOS_PROPIOS` | — |
| `LUNAS` | Rotura de lunas (parabrisas, laterales y luneta) | `DANOS_PROPIOS` | — |
| `ROBO_TOTAL` | Robo total del vehículo | `ROBO` | `ROBO_TOTAL` |
| `ROBO_PARCIAL` | Robo de autopartes y accesorios originales | `ROBO` | `ROBO_AUTOPARTES` |
| `RC_TERCEROS` | Responsabilidad civil frente a terceros | `RESPONSABILIDAD` | `DANO_TERCEROS` |
| `ACC_OCUPANTES` | Accidentes personales para ocupantes | `RESPONSABILIDAD` | — |
| `AUXILIO_MECANICO` | Auxilio mecánico y grúa | `ASISTENCIA` | — |
| `CHOFER_REEMPLAZO` | Chofer de reemplazo | `ASISTENCIA` | — |
| `AUTO_REEMPLAZO` | Vehículo de reemplazo mientras el tuyo está en taller | `ASISTENCIA` | — |
| `ASISTENCIA_LEGAL` | Asistencia legal | `ASISTENCIA` | — |
| `EXTRATERRITORIAL` | Cobertura en países vecinos | `ADICIONAL` | — |

La última columna es la tabla `cobertura_escenario` (6 filas): conecta una
cobertura "comercial" con los escenarios en dinero de la Prueba de Choque, para
que ambas pantallas no se contradigan.

### 18.4 Matriz plan × cobertura (✓ cubre · ✗ no cubre)

Columnas: **R** = Rímac, **P** = Pacífico, **LP** = La Positiva, **M** = Mapfre,
**Q** = Qualitas.

| Cobertura | R Plata | R Oro | P Básico | P Premium | LP Clásico | LP Full | M Esencial | M Total | Q Estándar | Q Plus |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Daño por choque o vuelco | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Incendio y explosión | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Desastres naturales | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ |
| Rotura de lunas | ✗ | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ |
| Robo total | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Robo de autopartes | ✗ | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ | ✓ |
| Responsabilidad civil | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Accidentes de ocupantes | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ |
| Auxilio mecánico | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Chofer de reemplazo | ✗ | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ | ✓ |
| Vehículo de reemplazo | ✗ | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ | ✓ |
| Asistencia legal | ✗ | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ |
| Países vecinos | ✗ | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| **Total que cubre** | **7** | **13** | **5** | **13** | **9** | **13** | **5** | **11** | **7** | **12** |

Son 95 filas con `incluida = true` y 35 con `incluida = false` (130 en total =
10 planes × 13 coberturas).

### 18.5 Descripción y detalle de cada plan

Cada bloque muestra lo que se guarda en `plan` (resumen, descripción, ideal
para) y los `detalle` de `plan_cobertura`. Los deducibles y el taller **no**
están aquí: son de la Prueba de Choque (`cobertura_plan_escenario`).

**Rímac**

- **Plata** — *"Protección esencial para el uso diario."* Cubre daños propios
  por choque, incendio y desastres naturales, robo total y responsabilidad
  civil, con auxilio mecánico. Es el plan de entrada: no incluye lunas,
  autopartes ni servicios de reemplazo. *Ideal para* quien usa el auto a
  diario y quiere lo esencial a buen precio.
  Detalle: RC hasta USD 100,000 · Ocupantes hasta USD 5,000 por persona ·
  Auxilio 4 servicios al año.
- **Oro** — *"Cobertura ampliada con lunas, autopartes y asistencia completa."*
  Todo lo de Plata más lunas, autopartes, chofer y vehículo de reemplazo,
  asistencia legal y países vecinos, con límites más altos. *Ideal para* quien
  no quiere quedarse sin auto ni preocuparse por trámites.
  Detalle: RC hasta USD 200,000 · Ocupantes hasta USD 15,000 · Auxilio sin
  límite · Chofer 2 servicios al año · Auto de reemplazo hasta 10 días ·
  Abogado en comisaría · Bolivia, Chile, Colombia y Ecuador.

**Pacífico**

- **Básico** — *"Cobertura económica para daños y robo total."* Protege ante
  choque, incendio y robo total, con responsabilidad civil y auxilio
  limitado. No incluye desastres naturales, lunas ni ocupantes. *Ideal para*
  autos de uso ocasional con presupuesto ajustado.
  Detalle: RC hasta USD 80,000 · Auxilio 2 servicios al año.
- **Premium** — *"Cobertura total con asistencia ilimitada y presencia en la
  región."* Incluye las 13 coberturas del catálogo. *Ideal para* autos de
  alto valor o uso intensivo que viajan a países vecinos.
  Detalle: RC hasta USD 150,000 · Ocupantes hasta USD 20,000 · Auxilio sin
  límite · Chofer 3 servicios al año · Auto de reemplazo hasta 15 días ·
  Abogado en comisaría · Bolivia, Chile, Colombia y Ecuador.

**La Positiva**

- **Clásico** — *"Cobertura equilibrada con desastres naturales y orientación
  legal."* Cubre choque, incendio, desastres, lunas, robo total,
  responsabilidad civil y ocupantes, con auxilio y orientación legal
  telefónica. No cubre autopartes ni servicios de reemplazo. *Ideal para*
  familias que buscan equilibrio entre precio y cobertura.
  Detalle: RC hasta USD 100,000 · Ocupantes hasta USD 10,000 · Auxilio 3
  servicios al año · Orientación legal telefónica.
- **Full** — *"Cobertura completa, con los límites más altos."* Las 13
  coberturas, con vehículo de reemplazo hasta 20 días. *Ideal para* quien usa
  el auto para trabajar o viaja con frecuencia.
  Detalle: RC hasta USD 200,000 · Ocupantes hasta USD 25,000 · Auxilio sin
  límite · Chofer 4 servicios al año · Auto de reemplazo hasta 20 días ·
  Abogado en comisaría · Bolivia, Chile, Colombia y Ecuador.

**Mapfre**

- **Esencial** — *"Cobertura mínima para autos de bajo valor."* Choque,
  incendio, robo total y responsabilidad civil, con auxilio limitado. No cubre
  desastres, lunas, autopartes ni ocupantes. *Ideal para* autos antiguos o de
  bajo valor.
  Detalle: RC hasta USD 60,000 · Auxilio 2 servicios al año.
- **Total** — *"Cobertura amplia con asistencia ilimitada."* Suma desastres,
  lunas, autopartes, ocupantes, chofer y vehículo de reemplazo. No incluye
  asistencia legal ni cobertura fuera del Perú. *Ideal para* uso diario en
  ciudad con buena protección.
  Detalle: RC hasta USD 150,000 · Ocupantes hasta USD 15,000 · Auxilio sin
  límite · Chofer 2 servicios al año · Auto de reemplazo hasta 10 días.

**Qualitas**

- **Estándar** — *"Cobertura básica con desastres naturales y ocupantes."*
  Choque, incendio, desastres, robo total, responsabilidad civil, ocupantes y
  auxilio. No cubre lunas, autopartes ni servicios de reemplazo. *Ideal para*
  conductores que quieren lo básico con el descuento comercial de Qualitas.
  Detalle: RC hasta USD 80,000 · Ocupantes hasta USD 5,000 · Auxilio 3
  servicios al año.
- **Plus** — *"Cobertura ampliada con lunas, autopartes y reemplazo."* Suma
  lunas, autopartes, auxilio ilimitado, chofer, vehículo de reemplazo y
  orientación legal. No incluye cobertura fuera del Perú. *Ideal para* quien
  quiere más protección sin pagar el máximo.
  Detalle: RC hasta USD 120,000 · Ocupantes hasta USD 12,000 · Auxilio sin
  límite · Chofer 2 servicios al año · Auto de reemplazo hasta 7 días ·
  Orientación legal telefónica.

### 18.6 Otras exclusiones (`plan_exclusion`, 70 filas)

Valen aunque la cobertura exista. Seis son **comunes a los 10 planes** (60
filas) y cada plan agrega **una específica** (10 filas):

| Exclusión | Planes |
|---|---|
| Conducir con alcohol sobre el límite legal o bajo efectos de drogas | los 10 |
| Conducir sin licencia vigente o con licencia de otra categoría | los 10 |
| Uso distinto al declarado (por ejemplo, taxi o aplicativo si se declaró uso particular) | los 10 |
| Desgaste, falla mecánica o falta de mantenimiento | los 10 |
| Carreras, competencias y pruebas de velocidad | los 10 |
| Guerra, invasión y energía nuclear | los 10 |
| Daños ocurridos fuera del territorio peruano | los 7 planes **sin** "Países vecinos": R Plata, P Básico, LP Clásico, M Esencial, M Total, Q Estándar, Q Plus |
| Daños a mercadería o carga transportada | los 3 planes **con** "Países vecinos": R Oro, P Premium, LP Full |

La última pareja de filas es una regla de coherencia: "fuera del territorio
peruano" aparece como exclusión **si y solo si** `EXTRATERRITORIAL` es ✗ (el
seed lo verifica, 18.10).

### 18.7 Requisitos (`plan_requisito`, 40 filas = 4 por plan)

| Tipo | Texto (igual en los 10 planes salvo la edad) |
|---|---|
| `VEHICULO` | Vehículo del año 2015 al 2026 (antigüedad máxima 12 años) |
| `CONDUCTOR` | Conductor habitual con licencia vigente y **edad mínima según el plan** (tabla de abajo) |
| `DOCUMENTO` | DNI o carné de extranjería vigente y tarjeta de identificación vehicular |
| `INSPECCION` | Inspección previa si la regla de inspección de la aseguradora la exige para tu uso (se avisa al cotizar) |

Edad mínima del conductor: **21 años** en R Oro, P Premium, LP Full y Q Plus ·
**23 años** en R Plata, LP Clásico, M Total y Q Estándar · **25 años** en P
Básico y M Esencial.

> **Los requisitos informan, no bloquean** (RN-44). Lo que realmente impide
> cotizar o comprar sigue siendo: el rango de suma (si el modelo/año no tiene
> fila, no hay cotización, RN-39), los `campo_requerido` (RF-03), la
> `regla_inspeccion` (RN-03) y el nicho (RN-05). Por eso el requisito de
> vehículo coincide con los años que cargan los rangos (2015–2026): si algún
> día se amplían los años, se actualiza también este texto.

### 18.8 Cómo lo usa el sistema (de punta a punta)

1. **Comparativo**: cada tarjeta de plan muestra `resumen` y las cuatro
   primeras coberturas incluidas (por `cobertura.orden`). El botón "Ver
   detalle" abre un panel con tres pestañas: *Qué cubre*, *Qué no cubre*
   (coberturas con ✗ + exclusiones) y *Requisitos*.
2. **Comparar planes**: el cliente marca hasta 3 planes y ve la matriz de 18.4
   (solo los planes elegidos), fila contra fila.
3. **Compra**: al crear la orden, el backend arma una copia del contenido del
   plan y se la pasa a `crear_orden_compra` (RN-45). Queda en
   `orden_compra.contenido_plan`.
4. **Póliza PDF**: lista las coberturas, exclusiones y requisitos desde esa
   copia, no desde las tablas vivas.
5. **Administración**: el administrador edita el contenido de un plan en una
   sola pantalla (`admin_guardar_plan_contenido`, todo o nada) y el sistema le
   dice qué falta o qué contradice a la Prueba de Choque (18.10).

Ejemplo de la copia guardada (plan **Rímac Oro**, abreviado):

```json
{
  "planId": "0b5f…", "aseguradora": "Rímac", "plan": "Oro",
  "resumen": "Cobertura ampliada con lunas, autopartes y asistencia completa",
  "descripcion": "Todo lo de Plata más lunas, autopartes, chofer y vehículo de reemplazo…",
  "idealPara": "Quien no quiere quedarse sin auto ni preocuparse por trámites",
  "coberturas": [
    { "codigo": "DANO_CHOQUE", "nombre": "Daño propio por choque o vuelco", "categoria": "DANOS_PROPIOS", "incluida": true,  "detalle": null, "limiteMonto": null },
    { "codigo": "RC_TERCEROS", "nombre": "Responsabilidad civil frente a terceros", "categoria": "RESPONSABILIDAD", "incluida": true, "detalle": "Hasta USD 200,000", "limiteMonto": 200000.00 }
  ],
  "exclusiones": ["Conducir con alcohol sobre el límite legal o bajo efectos de drogas", "…"],
  "requisitos": [ { "tipo": "CONDUCTOR", "texto": "Conductor habitual con licencia vigente y mayor de 21 años", "obligatorio": true } ],
  "congeladoEn": "2026-11-11T18:40:00-05:00"
}
```

### 18.9 Relación con la Prueba de Choque (sin contradicciones)

La Prueba de Choque calcula **cuánto pagas tú** en seis escenarios y usa
`cobertura_plan_escenario` (sección 16). El contenido comercial dice **qué
cubre** el plan. Si dijeran cosas distintas, el cliente vería "Robo de
autopartes ✗" en el detalle y un deducible de autopartes en la simulación.
Para evitarlo, `cobertura_escenario` une cada cobertura con sus escenarios y
rige RN-43:

| Si `plan_cobertura` dice… | …entonces `cobertura_plan_escenario` de los escenarios ligados debe tener… |
|---|---|
| `incluida = true` | `cubre = true` en **al menos uno** de ellos (en `DANO_CHOQUE`, en los tres si el plan no limita) |
| `incluida = false` | `cubre = false` en **todos** (con deducible y tope nulos, `ck_cobertura_coherente`) |

El seed 0018 (coberturas de ejemplo de la Prueba de Choque) se genera **desde
la matriz 18.4**, no a mano, justamente para cumplir esto. En producción lo
vigila la vista `v_plan_contenido_completitud` (18.10).

### 18.10 Cómo se verifica que el contenido está completo y es coherente

La vista `v_plan_contenido_completitud` (solo `ADMINISTRADOR`) devuelve una
fila por plan activo con:

| Columna | Qué indica |
|---|---|
| `coberturas_faltantes` | cuántas coberturas activas del catálogo no tienen fila en `plan_cobertura` (debe ser 0) |
| `tiene_resumen`, `tiene_descripcion`, `tiene_ideal_para` | texto presente |
| `n_requisitos`, `n_exclusiones` | al menos 1 requisito y 1 exclusión |
| `incoherencias_prueba_choque` | filas que violan RN-43 (debe ser 0) |
| `completo` | `true` solo si todo lo anterior está en orden |

Tres controles lo usan:

- `admin_cambiar_estado_plan` **rechaza activar** un plan con `completo = false`
  (RN-42).
- El seed 0021 corre las mismas comprobaciones al final y **falla** la
  migración si algo no cuadra (95 incluidas + 35 no incluidas = 130; 70
  exclusiones; 40 requisitos; "fuera del territorio" ⇔ `EXTRATERRITORIAL` ✗).
- Una alerta diaria avisa al administrador si algún plan activo está
  incompleto, incoherente o con `contenido_actualizado_en` de más de 180 días.

### 18.11 Agregar el contenido de un plan nuevo

1. Crear el plan (`plan`) con `resumen`, `descripcion` e `ideal_para`.
2. Llenar **las 13 coberturas** (sí o no, con `detalle` si aplica). Si el
   catálogo creció, primero crear la cobertura nueva y definir su fila en
   **todos** los planes activos (la vista lo marcará mientras falte alguno).
3. Agregar exclusiones y requisitos.
4. Revisar RN-43 contra la Prueba de Choque y activar el plan.

No se toca código: el panel de detalle, el comparador y la póliza leen estas
tablas.

### 18.12 Preguntas típicas de defensa

- **¿Por qué las coberturas son un catálogo común y no texto libre por
  plan?** Porque con un catálogo se pueden comparar planes de distintas
  aseguradoras fila contra fila, filtrar ("solo planes con chofer de
  reemplazo") y detectar faltantes. Con texto libre cada plan sería un párrafo
  distinto y nada sería comparable.
- **¿Por qué "no cubre" es una fila y no una ausencia?** Porque una ausencia
  es ambigua: ¿no cubre o nadie lo cargó? Con la fila `incluida = false` el
  sistema distingue "no cubre" de "falta información" (misma idea que RN-30).
- **¿Qué diferencia hay con `cobertura_plan_escenario`?** Esta última dice
  *cuánto pagas tú* en un siniestro concreto (deducible, tope, taller); el
  contenido comercial dice *qué tipo de eventos cubre el plan*. Se conectan
  con `cobertura_escenario` para no contradecirse (RN-43).
- **¿Por qué se guarda una copia en la orden?** Porque el contenido puede
  editarse mañana; el cliente debe poder ver exactamente lo que contrató
  (igual que el desglose de la prima, RN-41).
- **¿Los requisitos bloquean la compra?** No: informan. Lo que bloquea son los
  rangos, los campos requeridos, la inspección y el nicho (RN-44).
- **¿Esto también es secreto comercial como las tarifas?** No: el contenido es
  lo que se le muestra al cliente, por eso es de lectura para cualquier
  usuario (con RLS), a diferencia de las tarifas que solo ve el administrador.

# Estado de la implementación — SVAS / SeguroSimple

> Documento de traspaso entre sesiones. Léelo junto con
> `contexto-dominio-seguro-simple.md` (manda en caso de conflicto) y
> `arquitectura-backend-seguro-simple.md` (orden de construcción en §10).
> Última actualización: 2026-11-12 (backend: Ola 4 cerrada · frontend: configuración inicial y Ola 0, ver §1b).

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

## 1b. Frontend (repo `SVAS-frontend`) — dónde estamos

> **El frontend vive en su propio repo**: https://github.com/Charlie-Sehuin/SVAS-frontend. Se separó para que un
> cambio del frontend nunca dispare un redespliegue del backend en Railway (cada push a `main` de este repo lo
> redespliega). Los docs del frontend siguen aquí, en `docs/`, porque los comparten ambos lados. Las rutas de código
> del frontend que aparecen abajo son relativas a la raíz de ese repo (p. ej. `src/shared/lib/tarifas.constants.ts`).
>
> **Carpeta local recomendada** (todo junto, cada repo con su propio Git):
> ```
> svas/                  ← repo SVAS (backend + docs)
> ├── docs/  imagenes/  svas-backend/
> └── svas-frontend/     ← repo SVAS-frontend; este repo lo ignora (.gitignore)
> ```
> Se clona con `git clone https://github.com/Charlie-Sehuin/SVAS-frontend.git svas-frontend` dentro de `svas/`.
> Los comandos `git` de cada repo se ejecutan dentro de su carpeta.

> Sigue `arquitectura-frontend-seguro-simple.md` (§16, orden por olas) y `diseno-visual-seguro-simple.md`
> (tokens y apariencia; reemplaza §2–4 del de arquitectura).

| Parte | Estado |
|---|---|
| Config inicial (§16.1, pasos 1–6) | ✅ hecho el 2026-11-12: Vite 8 + React 18 + TS estricto, Tailwind 4 con los tokens de la guía visual, `shared/lib` (api-client con ky 2, Supabase solo sesión, query-client, query-keys, format), `AuthProvider` + `RoleGuard` + `LoginPage`, `PublicLayout` + `BackofficeLayout` (sidebar por rol), router completo con `<PantallaPendiente>` en las rutas sin construir, componentes de dominio base (`MoneyValue`, `StatusBadge`, `WarningToast`/`ErrorToast`, `RoleGate`, `DemoLegend`), MSW (`/health`, `/catalogo/campos`, `/usuarios/me`) y landing |
| Config inicial paso 7 (publicar el frontend) | ✅ hecho el 2026-11-12 en **Render** (sitio estático, no Vercel): https://svas-frontend.onrender.com. Configuración en `render.yaml` del repo del frontend; guía y diagnóstico en `docs/despliegue-frontend.md`. Probado a mano (portada, iniciar sesión, cotizar) |
| Ola 0 · login + admin (catálogo, parámetros, usuarios, bitácora, tarifas, simulador) | ✅ hecho el 2026-11-12 (ver abajo); login probado contra Railway; las pantallas se probaron con MSW (12 pruebas) y las 13 rutas `/admin/*` existen en Railway (401 sin sesión), pero falta recorrerlas en el navegador con el ADMINISTRADOR |
| Ola 1 · cotizar + comparativo | ✅ hecho el 2026-11-12 (ver abajo): asistente de 3 pasos, comparativo con suma asegurada por aseguradora, derivación y "Mis cotizaciones". Contrato verificado contra Railway; falta recorrerlo en el navegador |
| Ola 2 · Prueba de Choque, planes, asesoría/retención | ✅ construida el 2026-11-12 (ver abajo): cliente (Prueba de Choque, detalle y comparador de planes, "Hablar con un asesor", retoma), asesor (cola, caso, seguimientos) y administración (reglas de la Prueba de Choque y contenido de planes). 121 pruebas con MSW. **Sin recorrer en el navegador con datos reales**: las pantallas del asesor y las de administración (con una cuenta ASESOR y la del ADMINISTRADOR) |
| Ola 3 · compra + pólizas | ✅ hecho el 2026-11-12 (ver abajo): asistente de compra, confirmación con PDF y "Mis pólizas". 26 pruebas con MSW; las rutas existen en Railway (401 sin sesión) y las formas coinciden con el código del backend y con Bruno 12. Recorrida a mano con cuentas de prueba (compra en cuotas y al contado, PDF y "Mis pólizas") y corregida con lo que salió (ver abajo) |
| Ola 4 · dashboard + reportes | ✅ construida el 2026-11-12 (ver abajo): dashboard por rol y los cinco reportes (ventas con PDF, retención, descuentos, ★ impacto de la Prueba de Choque y mi desempeño). 21 pruebas con MSW. **Sin recorrer en el navegador con datos reales** (son pantallas de solo lectura) |

Verificación al cierre: `npm run typecheck`, `npm run lint` y `npm test` (304 pruebas, incluida la guardia de contraste del modo claro y oscuro) en verde; `npm run build` OK.
JS inicial de la landing ≈ 161 KB gzip (meta < 180 KB, arquitectura §6.2): Supabase, los formularios (zod y react-hook-form, en su
propio chunk `formularios`) y cada pantalla van aparte y el embudo no los descarga. Ojo: si una pantalla del arranque importa
un formulario, ese chunk se vuelve a precargar; se vigila mirando `dist/index.html` después de `npm run build`.

Ola 0 construida (`features/administracion/`, rutas en `/app/admin/*`):
- **Usuarios y roles**: lista con filtros y paginación, crear (la contraseña temporal se muestra una sola vez), cambiar rol y
  activar/desactivar con confirmación; el administrador no puede desactivarse ni cambiarse el rol a sí mismo.
- **Contraseñas**: la temporal de un usuario nuevo es una frase legible de 4 palabras y un número
  (`Luna-Roble-Mango-Faro-47`, ≈ 38 bits; `generarContrasenaLegible` en el backend), válida solo hasta que la persona la
  cambie. Cualquier usuario la cambia desde su menú de cuenta → **Cambiar contraseña** (pide la actual, mínimo 8 y máximo
  72 caracteres). La contraseña del administrador se cambia ahí mismo; si se usa Bruno, hay que actualizar `ADMIN_PASSWORD`
  en `svas-backend/bruno/.env`.
- **Aseguradoras y planes**: interruptores de activa/activo, crear y editar planes; si activar un plan responde 400 por
  contenido incompleto (RN-42) se muestra el mensaje con enlace a `/app/admin/planes/:planId/contenido` (esa pantalla es de la Ola 2).
- **Campos requeridos**, **Reglas de inspección** (matriz aseguradora × uso), **Parámetros comerciales** y **Bitácora**
  (filtros por entidad y fechas de Lima, antes/después). Validan en el cliente las mismas reglas que el backend.
- **Tarifas** (`/app/admin/tarifas/*`): tasa base y parámetros de cada plan (el formulario cambia según la aseguradora),
  pesos con edición en línea y CSV (descargar y cargar), rangos de suma con filtro por marca y modelo, completitud y
  **Simulador** con `<DesgloseCalculo>` (RN-41).
- `/app` del ADMINISTRADOR muestra un panel con los contadores de `GET /admin/panel` y los últimos cambios; el dashboard
  real es de la Ola 4. El ASESOR sigue viendo la pantalla "pendiente".
- Reutilizable para la Ola 1: `SelectorVehiculoCascada`, `SelectorUbigeoCascada` y los hooks de `features/cotizacion/hooks/useCatalogo.ts`.

Decisiones propias de la Ola 0 (revisables):
- El backend no expone qué pesos y parámetros usa cada fórmula: `shared/lib/tarifas.constants.ts` los espeja a mano
  (pesos requeridos/opcionales y parámetros por aseguradora). Si cambia una Estrategia, hay que cambiarlo ahí. Solo decide qué
  se muestra; el backend vuelve a validar todo. Cómo mantenerlo: `docs/guia-tarifas-pesos.md`.
- Pesos y rangos guardan solo las filas que cambiaron y comparan en números (no en texto). El editor conserva lo que se teclea
  aunque un texto intermedio coincida con el original.
- Los enums del frontend se sincronizaron con los del backend (`UsoVehiculo` tiene 3 valores, no 4).
- La lista de entidades de la bitácora es una sugerencia fija; el filtro acepta cualquier nombre en minúsculas.
- Los rangos de suma se editan en línea; el doc pide CSV solo para pesos, así que no hay carga masiva de rangos.

Ola 1 construida (`features/cotizacion/`, rutas públicas `/cotizar` y `/cotizacion/:id`, y `/mi-cuenta/cotizaciones` para el CLIENTE):
- **Asistente `/cotizar`** en 3 pasos (Vehículo · Ubicación · Contacto), una decisión por pantalla en móvil, CTA fijo abajo, resumen lateral en
  escritorio, validación al salir del campo y foco al título del paso nuevo. El borrador vive en sessionStorage. El formulario se arma desde
  `GET /catalogo/campos` (obligatoriedad y opciones). La tarjeta del hero de la landing ya trae marca, modelo y año reales y los pasa al asistente.
- **Errores del backend**: los errores por campo (`vehiculo.marcaId`, `contacto.telefono`…) se asignan al campo y se vuelve a su paso; el 422
  de fuera de nicho (RN-05) muestra el mensaje con un enlace para llamar; el aviso `ASEGURADORA_SIN_COTIZACION` sale una sola vez (toast con `id`).
- **Comparativo `/cotizacion/:id`**: un bloque por aseguradora, la cuota mensual como protagonista, orden por precio o A–Z, filtro por aseguradora,
  tarjeta gris por aseguradora que no cotiza (RF-05), `DerivacionBanner` (RN-03/RN-04) que oculta "Comprar", y cotización ya convertida (sin comprar ni cambiar la suma).
- **Una sola barra de suma asegurada** (`SumaAseguradaControl`, RN-37), decisión de producto del 2026-11-12: slider + campo numérico arriba del comparativo
  (fijo en escritorio) que sirve para toda la cotización. Al elegir una suma (espera 400 ms y valida el rango antes de llamar) el frontend pide el
  recálculo a CADA aseguradora que cotizó, en paralelo, con el mismo `PATCH …/aseguradoras/:id/suma-asegurada` de siempre, y pinta las primas que devuelve
  el backend (esqueleto mientras llegan). Como cada aseguradora tiene su propio rango, la barra va del mínimo más bajo al máximo más alto, y a la que
  no admite el valor elegido se le pide su mínimo o su máximo, y el bloque de esa aseguradora lo dice ("Usamos USD 16,800, el máximo que permite Rímac").
  Al abrir la cotización la barra está "sin elegir" (cada aseguradora propone su punto medio) hasta que la persona la mueve; lo elegido se recuerda
  en sessionStorage. Un 400 deja la barra "sin elegir" otra vez sin reintentar; un 409 la bloquea. Nunca se calcula una prima en el navegador.
  **Esto reemplaza el control por aseguradora** que describen `arquitectura-frontend` §4.2 y §6.9, `diseno-visual` §8.3 y §9.3, y `contexto-dominio` §14;
  esos textos siguen diciendo "uno por aseguradora" y conviene actualizarlos. El backend no cambia (la suma sigue siendo por aseguradora, RN-37).
- **Comprar sin cuenta** (CU-02): la ruta `/compra/:cotizacionId` es pública y, sin sesión, abre `RegistroMinimoDialog` en lugar de mandar a un login.
  El contacto que se escribió al cotizar queda en sessionStorage y viene prellenado: solo falta la contraseña (mínimo 8, con la sugerencia de una frase
  fácil de recordar). Llama a `POST /auth/registro` con `cotizacionId` y el `X-Cotizacion-Token` (a mano, porque esa URL no es de una cotización), e inicia
  sesión. Si el correo ya existe ofrece "Inicia sesión" y, desde el login, "Créala para comprar" vuelve a la compra. Con la cuenta lista se entra al
  asistente de compra (Ola 3, abajo). Solo un CLIENTE compra; asesor y administrador ven "sin acceso".
- Decisiones: (1) el `api-client` manda el Bearer **y** el `X-Cotizacion-Token` si tiene ambos, porque con sesión el backend solo usa el token si la
  cotización no es del usuario; (2) la clasificación por precio compara números con `decimal.js` (no calcula); (3) "Hablar con un asesor" es por ahora
  un enlace `tel:` y "Comprar este plan" va a `/compra/:id?prima=…` (asistente de la Ola 3); el diálogo de asesoría llega en la Ola 2.
- **Fuera de esta ola** (llegan en la Ola 2): "Ver detalle", "Comparar", el botón de la Prueba de Choque y la opción de ordenar por costo real.
- **Límite del formulario dinámico**: `POST /cotizaciones` tiene un cuerpo fijo y el backend rechaza propiedades que no declara. Hoy solo `placa` y
  `clase` pueden dibujarse y enviarse desde el catálogo. Un campo nuevo creado en el administrador **no aparece** en el formulario hasta que el
  backend lo admita (`RUTA_CAMPO` y `CotizarDto`); si fuera obligatorio, bloquearía las cotizaciones. Para cumplir de verdad "agregar un campo sin
  desplegar" habría que aceptar un objeto de campos extra en el backend.
- **Datos de prueba en producción**: al verificar el contrato se creó una cotización con el correo `prueba.frontend@example.com` (Toyota Corolla 2022,
  Miraflores) y se movió la suma de Rímac a su mínimo. Quedan en la bitácora como COTIZAR y AJUSTAR_SUMA.

Ola 3 construida (`features/compra/`, rutas `/compra/:cotizacionId`, `/compra/:id/listo` y `/mi-cuenta/polizas`):
- **Asistente `/compra/:cotizacionId?prima=<primaCotizadaId>`** (`AsistenteCompra`): Resumen → Tus datos → Firma → Pago, un paso por pantalla, con "Paso X de N",
  barra de avance, foco al título del paso nuevo y botón principal fijo abajo en móvil; en escritorio, un resumen compacto al costado. Sin `?prima=` ofrece volver
  a elegir plan. Si la compra ya estaba iniciada (hay orden), va directo al pago sin pedir otra firma; si ya estaba pagada, a la confirmación.
  - **Resumen** (`GET /compras/resumen`): suma asegurada, prima anual, descuento de primera compra y prima final, tal como llegan. Si el backend responde
    404/400/409 se muestra su mensaje con un enlace para volver a la cotización.
  - **Tus datos** (RNF-08): solo aparece si `GET /compras/:cotizacionId/campos-faltantes` trae algo (documento y/o placa); `PUT …/datos`. Los errores por
    campo del backend se pintan bajo el campo. La decisión de mostrar el paso se toma una vez, así la numeración no cambia a mitad de camino.
  - **Firma y condiciones**: nombre escrito como firma simulada + casilla de aceptación; recién aquí se llama a `POST /compras` (congela montos y contenido del
    plan, RN-45). Un 409 (p. ej. `CONTENIDO_PLAN_INCOMPLETO`) muestra el mensaje del backend y el enlace "Volver al comparativo".
  - **Pago**: dos tarjetas-radio (`SelectorModoPago`): pago único y N cuotas, con el total y la cuota que devuelve el backend y, si hay recargo, la frase
    "Pagar en cuotas tiene un recargo de X % en {aseguradora}". Si el backend no ofrece cuotas (`CUOTAS: null`) solo aparece el pago único. El botón dice
    "Pagar USD …" con el total elegido. Mientras se procesa: "Procesando tu pago…" (texto y spinner).
  - **`Idempotency-Key`**: se genera una por intento (`crypto.randomUUID()`), se **conserva** si falló la red o el servidor (reintentar no cobra dos veces) y se
    **renueva** si el pago fue rechazado (400) o si cambió el modo de pago. Un 400 muestra la banda roja "Tu pago no pudo procesarse" con el mensaje del backend
    y el botón "Intentar con otro medio"; un 409 (ya pagada) lleva a la confirmación. Un total terminado en .13 simula el rechazo.
- **Confirmación `/compra/:id/listo`** (`GET /compras/:id/estado`): "¡Listo! Tu seguro está activo", número de póliza en JetBrains Mono, montos, forma de pago,
  **Descargar mi póliza (PDF)**, **Ver cronograma de cuotas** (estado de cada cuota con texto), "Lo que contrataste" con la copia congelada del plan y su fecha
  (RN-45) más la leyenda de contenido (RN-46), y "Documento de demostración sin validez legal" (RNF-20). Si la orden no está pagada no se celebra: ofrece "Continuar con el pago".
- **PDF** (`GET /polizas/:id/pdf`): se baja como `Blob` con el Bearer y se entrega al navegador con el nombre de `Content-Disposition`. Un 202 (`PDF_EN_GENERACION`)
  muestra un toast ámbar (la póliza ya existe; el backend reintenta cada 5 min) y el botón queda disponible; la pantalla también lo explica con texto.
- **Mis pólizas `/mi-cuenta/polizas`** (`GET /polizas/mias`): tarjeta por póliza (aseguradora, plan, vehículo y placa, número, fecha, suma, total pagado o "en N cuotas"),
  insignia "Activa", descarga y "Lo que contrataste" desplegable; estados de carga, vacío y error con reintento.
- Decisiones: (1) el frontend no suma, divide ni calcula: solo compara con cero el recargo para decidir si muestra la frase; (2) el detalle del plan **antes** de
  comprar (drawer "Ver detalle") es de la Ola 2: el resumen aún no lo trae, solo se muestra lo contratado en la confirmación y en Mis pólizas; (3) la
  pasarela, la emisión y los mensajes siguen simulados a propósito y la pantalla lo dice ("El pago es simulado: no se cobra dinero real"); (4) documento y placa se
  envían en mayúsculas (el backend ya normaliza); (5) `src/test/setup.ts` ahora define `matchMedia` aunque jsdom lo traiga sin implementar (lo necesita el `Toaster`).
- Nota de herramientas: en Windows, las pruebas (`npm test`) deben correrse desde PowerShell o CMD; desde Git Bash con la ruta `/c/...` Vitest falla con
  "failed to find the runner" por la forma de la ruta.

Correcciones de la Ola 3 tras recorrerla a mano (2026-11-12):
- **"La cotización no existe" al comprar**: quien cotizó sin cuenta y luego entró con una cuenta que ya tenía no tenía la cotización vinculada y las rutas de compra no la veían
  (RLS). Ahora, si la pestaña guarda el token de esa cotización, se llama a `PATCH /cotizaciones/:id/cliente` antes de cargar la compra (`useVinculoCotizacion`); es idempotente.
- **En cuotas se paga la 1.ª cuota, no el total**: el botón dice "Pagar mi 1.ª cuota: USD …" con una nota ("las otras N cuotas vencen una cada mes"); la confirmación separa
  "Pagado hoy (1.ª cuota)", "Cuotas por pagar" y "Total del plan de cuotas". La 1.ª cuota es exactamente la cuota mensual del resumen (la última absorbe el redondeo).
- **WhatsApp viene preseleccionado** como canal de contacto al cotizar (el backend sigue exigiendo el campo; el frontend lo manda por defecto). El botón final del asistente dice
  "Ver planes y precios" (el diseño decía "Ver mis cotizaciones", que confundía).
- **Regla de nicho (RN-05)**: hasta 2 vehículos particulares (5 comerciales) por documento; al pasarse, la cotización no se crea y se informa. Las cuentas de prueba la alcanzan rápido.

Ola 2 construida · cliente (rutas públicas `/cotizacion/:id/prueba`, `/comparar`, `/retoma/:token`):
- **★ Prueba de Choque** (`features/prueba-choque/`): botón turquesa "Pon a prueba estos planes" en el comparativo; la primera vez se abren 3 preguntas (cochera, muchos km, uso nocturno;
  ingreso diario solo en uso comercial, RN-33) y chips de preocupación. Resultado: ranking por Costo Real Anual con barra apilada (prima + lo que pagarías tú), sello "Mejor protección
  por tu dinero" al primero con datos completos (los incompletos llevan "Información incompleta", RN-30), peor caso, matriz por escenario (tabla en escritorio, carrusel en móvil) con
  celdas "Pagas USD X" + nivel en texto, "Sin información" rayada, banda ámbar si la simulación quedó no vigente (RN-37), resumen en PDF y la leyenda RN-29 fija.
  **El nivel de cada celda** (escala `out-0…3`) lo clasifica el frontend comparando lo que paga la persona con el daño del escenario (≤ 10 %, ≤ 50 %, más; "alto" si hay algo no cubierto): solo
  clasifica, no muestra montos nuevos. La matriz espera al catálogo de escenarios antes de pintar para no mostrar un color equivocado.
- **Detalle y comparador de planes** (`features/planes/`): "Ver detalle" abre un panel lateral (pantalla completa en móvil) con pestañas Qué cubre / Qué no cubre (no incluidas + exclusiones) /
  Requisitos y la leyenda RN-46 fija; la casilla "Comparar" (hasta 3, "Máximo 3 planes") sube una barra fija abajo; `/comparar?ids=…` es pública y compartible (matriz ✓/✗ con texto,
  "Total que cubre: X de N"; la primera columna queda fija con fondo sólido). Un plan sin contenido publicado (`resumen: null`) no ofrece ver ni comparar (el backend respondería 404).
- **Hablar con un asesor** (`features/asesoria-retencion/cliente/`): diálogo con motivo (duda / negociar / descuento) y canal (WhatsApp por defecto); sin cuenta abre el registro en la misma
  pantalla; con una cuenta que ya existía vincula antes la cotización. Desde la Prueba de Choque abre con "duda" marcada. El botón de la barra azul abre este diálogo cuando hay una cotización a la
  vista; sin cotización (p. ej. en `/cotizar`) abre un cuadro con el teléfono en vez de un enlace `tel:` (en la computadora el navegador mostraba "Elegir una aplicación"). Asesor y administrador
  reciben "Solo los clientes pueden pedir asesoría desde aquí".
- **Retoma** (`/retoma/:token`, RN-12): reabre la cotización con el descuento; el enlace es de un solo uso y el `tokenAcceso` nuevo sale una vez, así que se guarda al recibirlo y el resultado
  se conserva en sessionStorage para sobrevivir a una recarga. Si se compra desde ahí, `POST /compras` lleva `origen: 'RETOMA'`. Enlace vencido: mensaje del backend + "Cotizar ahora".

Ola 2 construida · asesor (`features/asesoria-retencion/asesor/`, rutas `/app/asesorias`, `/app/asesorias/:id`, `/app/seguimientos`, `/app/seguimientos/:id`):
- **Cola** (CU-03): tabla (tarjetas en móvil) en el orden de RN-13 que manda el backend, prioridad con icono y texto (Sistema / Cliente), espera con "Espera larga" pasadas 4 h, filtros de estado y origen,
  "Tomar caso" (409 → mensaje del backend y la cola se refresca). El administrador solo lee.
- **Caso**: cliente (teléfono y correo completos; documento completo solo en el caso asignado o para el administrador), planes cotizados con precio, Prueba de Choque del cliente (solo si el caso es tuyo o eres
  administrador), **negociar descuento** (lista de planes con su precio y una etiqueta "Descuento vigente: X %", tope visible "Máximo permitido: 10 %" que el campo respeta) y **cerrar** (resultado ≤ 200
  caracteres + "el cliente aceptó", con confirmación). **RN-09**: se pueden registrar varios descuentos pero solo uno queda **vigente** por cotización, el mayor; uno igual o menor se guarda como "No vigente";
  cerrar con "no aceptó" deja sin vigente a los negociados. Por eso el historial dice Vigente / No vigente.
- **Seguimientos** (CU-04): lista con filtro de estado; detalle con contador "Intentos: 2 de 4 · quedan 5 días" (límites del backend), registrar intento con **solo el canal preferido habilitado** (RN-10), bloqueo
  con motivo en texto al llegar al máximo o vencer el plazo, aviso ámbar si el mensaje final no salió (`MENSAJE_NO_ENVIADO`), "El cliente aceptó por teléfono → Enviar enlace de compra" y cierre:
  descartar exige motivo (RN-11), convertir no. Un seguimiento nace cuando el detector (cada hora en punto, backend encendido) marca una cotización abandonada; sin ninguno, la lista sale vacía.
- Decisiones: (1) los datos personales los enmascara el backend en las listas; el frontend solo los pinta; (2) "quedan N días" se calcula con la fecha de apertura y `diasSeguimiento` (es tiempo, no dinero);
  (3) la vista previa del precio **con** descuento al negociar no existe: exigiría que el backend la calcule (el frontend no calcula dinero); (4) los hooks de estas pantallas refrescan cola y listas cada 30 s solo con la pestaña visible.

Ola 2 construida · administración (`features/administracion/`, rutas `/app/admin/prueba-choque/*`, `/app/admin/planes/:planId/contenido`, `/app/admin/coberturas`, `/app/admin/contenido/completitud`):
- **Reglas de la Prueba de Choque** (RF-36, RN-31): cuatro pantallas con pestañas y un aviso fijo ("supuestos referenciales; un cambio vale desde la siguiente simulación, las ya hechas no cambian, RN-32; cada guardado
  queda en la bitácora"). Todas editan en línea, envían **solo lo que cambió** y repiten las validaciones del backend (que vuelve a validar); sus mensajes se muestran tal cual, en el campo o en la fila.
  - **Escenarios**: crear y editar (el código no cambia después), activar o desactivar con un interruptor, "El daño es la suma asegurada" (monto `null`, como robo total y pérdida total) y, en los activos, qué les falta para
    simular bien: probabilidades sin cargar (el motor las toma como 0) y planes sin cobertura (salen "Sin información", RN-30), con enlaces a la pantalla donde se completan.
  - **Deducibles y topes**: se elige un plan y hay una fila por escenario (cubre, deducible %, mínimo, tope, taller, días de reemplazo y **fuente**, obligatoria). Si no cubre, deducible, tope y días se apagan y viajan
    vacíos (el backend los rechaza). Un escenario sin fila dice "Sin información" con "Definir". Los errores del backend por fila (`filas.N`) se pegan a su escenario.
  - **Frecuencias y zonas**: matriz uso × zona por escenario (0,0001 a 0,95; muestra el porcentaje al año; lo que falta dice "Falta: el motor usa 0") y, debajo, la zona de cada distrito con filtro, búsqueda y
    "agregar un distrito que no figura" (cuenta como MEDIA hasta asignarle zona).
  - **Factores de perfil**: escenario × variable (cochera, muchos km, uso nocturno), multiplicador de 0,10 a 3,00; 1,00 no cambia nada; celdas sin factor dicen "Sin factor".
- **Contenido de los planes** (dominio §18, RN-42..46):
  - **Contenido del plan**: cuatro pestañas (Descripción, Coberturas, Exclusiones, Requisitos), contador "N de M coberturas definidas" y **Guardar solo con el contenido completo**. El plan debe decir sí o no a TODAS las coberturas
    activas ("no cubre" es una fila `incluida: false`, nunca una ausencia, RN-42); el límite solo existe si la cobertura está incluida y un detalle vacío viaja `null`. Cada pestaña dice en texto qué falta. Las contradicciones con la
    Prueba de Choque (RN-43) se guardan igual y salen como lista ámbar con enlace a "Deducibles y topes". La validación vive en `contenido/borrador.ts` (sin React, con su propia prueba unitaria).
  - **Catálogo de coberturas**: lista y alta/edición (código fijo, categoría, descripción, orden, activa) con los escenarios de la Prueba de Choque que representa (RN-43). Avisa que agregar o activar una cobertura deja
    incompletos a los planes que aún no la definan.
  - **Completitud**: tabla con estado Completo / Incompleto / Incoherente por plan, qué le falta en frases, contradicciones y enlace a completar. Un plan inactivo puede estar incompleto.
  - Guardar el contenido refresca la completitud, la lista de planes (puede cambiar si el plan se puede activar) y el contenido público que ven los clientes en "Ver detalle" y en el comparador.
- **Pruebas** (infraestructura): `src/test/setup.ts` ahora limpia los toasts entre casos (viven en un estado global y una prueba veía los avisos de la anterior), sube la espera de `findBy…`/`waitFor` a 4 s (la suite creció y
  con todo en paralelo el segundo por defecto daba falsos fallos) y define `matchMedia` aunque jsdom lo traiga sin implementar.
- Decisiones: (1) frecuencias y zonas comparten pantalla (el menú tiene un solo ítem "Frecuencias y zonas"); (2) los porcentajes de las frecuencias se muestran como "20 % al año" solo como ayuda de lectura: no interviene en ningún
  monto; (3) una celda de factor o de frecuencia que ya existe no se puede **borrar** desde aquí (el backend solo reemplaza); (4) desactivar un escenario o una cobertura no pide confirmación porque es reversible.

Ola 4 construida (`features/reportes/` y `features/dashboard/`, rutas `/app` y `/app/reportes/*`):
- **Marco común** (`ReporteShell`, `FiltroPeriodo`): título, selector de periodo y los tres estados (cargando, error, datos). El periodo vive en la dirección (`?desde=&hasta=`; compartible y sobrevive a una recarga) con atajos
  (este mes, mes pasado, últimos 30 días, este año) y dos fechas; se valida como el backend (fechas reales, "desde" no posterior a "hasta", máximo un año) y un periodo inválido, aunque venga escrito a mano en la dirección, se explica sin llamar
  al backend. Sin fechas el backend usa el mes en curso y la pantalla dice el periodo usado en texto. Mientras llega un periodo nuevo se conserva lo anterior, atenuado y marcado como ocupado.
- **Reglas de presentación**: los montos y porcentajes los calcula el backend (el frontend solo formatea); un porcentaje `null` se muestra "Sin datos" y **nunca 0 %**; los gráficos son barras hechas con CSS (sin `recharts`, que el
  doc nombraba pero no hace falta) y **cada barra lleva su cifra en texto**; la serie principal va en `navy` y `accent` se reserva a la Prueba de Choque (diseño §10.2).
- **Ventas** (`/app/reportes/ventas`): pólizas, prima final, cobrado hasta hoy (en cuotas solo lo ya pagado), ticket promedio, descontado, agrupación por canal / aseguradora / plan (en la dirección), barras con la participación, tabla y
  **Descargar PDF** del mismo reporte con el periodo y la agrupación en pantalla. Los canales se rotulan "Compra autónoma", "Con asesoría", "Telemarketing".
- **Retención** (`/app/reportes/retencion`): embudo de seguimientos (abiertos → con intento → contactados → aceptaron → usaron el enlace → compraron), tasa de conversión, días promedio hasta comprar y desgloses de descartados por motivo e intentos
  por resultado y por canal. El mismo componente (`EmbudoRetencionVista`) lo usa "Mi desempeño".
- **Descuentos** (`/app/reportes/descuentos`): negociados (otorgados, aceptados, terminaron en compra, promedio, máximo, monto), los de primera compra y la tabla por asesor.
- **★ Impacto de la Prueba de Choque** (`/app/reportes/prueba-choque`, dominio §16.7): cotizaciones que la usan, conversión con y sin la prueba (con la aclaración de que es una comparación y no prueba causa), cuántos eligen un plan distinto
  al más barato o el primero del ranking, preocupaciones por uso y zona, y la conversión del mensaje final con y sin la frase de contraste RN-35. Los vacíos se dicen en texto.
- **Mi desempeño** (`/app/reportes/mi-desempeno`, solo ASESOR): sus asesorías por motivo, las ventas que se le atribuyen (asesoría y telemarketing), sus descuentos y su embudo. El administrador no tiene este reporte (el backend responde 403): se le
  explica sin pedirlo.
- **Dashboard** (`/app`, por rol): el ADMINISTRADOR ve las ventas del mes (4 indicadores y ventas por canal), "Para revisar" (solicitudes de asesoría pendientes, seguimientos abiertos y planes activos con contenido incompleto, con enlace
  cada uno) y el estado del catálogo (`PanelAdminContenido`, antes `PanelAdminPage`, que sigue existiendo). El ASESOR ve su cola (pendientes y sus casos en atención), sus seguimientos abiertos y su mes.
- "Compartir el resultado de la Prueba de Choque en PDF" (parte de la Ola 4 en la arquitectura) ya existía desde la Ola 2 (`Descargar resumen en PDF`).
- Decisiones: (1) las barras se dibujan con la proporción respecto del mayor (solo visual); (2) los atajos de periodo se calculan con el día de hoy de quien mira; (3) el dashboard del asesor y el del administrador piden sus propios datos y no
  comparten consultas entre sí.

Decisiones propias del frontend (revisables):
- Versiones actuales en vez de las del doc donde no cambia la API: Vite 8 (rolldown), Tailwind 4 (tokens en `@theme`
  dentro de `design-system/tokens/colors.css`; no hay `tailwind.config.ts`), ky 2 (`prefix` en vez de `prefixUrl`),
  msw 3 (`onUnhandledFrame`), zod 4. React 18, React Router 6 y TanStack Query 5 como pide el doc.
- Los componentes base estilo shadcn se escribieron a mano (`shared/ui/*`) con las variantes de la guía visual §7
  (`primary`, `accent`, `secondary`, `outlineNavy`, `ghost`, `destructive`); no se corrió `shadcn init`.
- `@supabase/supabase-js` se carga con `import()` (solo lo necesita quien inicia sesión).
- `WarningToast`/`ErrorToast`/`SuccessToast` son funciones sobre sonner (no componentes); `ErrorToast` no se cierra solo
  y ofrece copiar el `correlationId`.
- El "despertando el servidor" lo marca el api-client a los 4 s sin respuesta y lo pinta `<WakeUpBanner>` en ambos layouts.
- El token de la cotización anónima se guarda por `cotizacionId` en sessionStorage y el api-client lo manda solo cuando
  la URL es `cotizaciones/:id/...` y no hay sesión.
- Logo y logos de aseguradoras son tipográficos hasta tener los SVG oficiales.
- Pendiente de decidir (guía visual §17): hex exacto de marca, tipografía (se asumió Lato), `<PromoBanner>` (vacío).
- Editar la fórmula de una aseguradora desde el frontend **no existe** (RN-40: la fórmula es código). El diseño propuesto
  para hacerlo, con sus reglas de seguridad y un plan por tandas, está en `propuesta-editar-formulas-desde-frontend.md`.

Comandos:
```powershell
cd C:\Users\Charlie\Desktop\Office\svas\svas-frontend
npm run dev          # http://localhost:5173 (con el backend LOCAL y su FRONTEND_URL=http://localhost:5173; contra Railway el CORS lo bloquea, ver docs/despliegue-frontend.md)
npm run typecheck; npm run lint; npm test; npm run build
```

## 1c. Siguiente paso del frontend (recorrer con datos reales)

**El frontend quedó completo** (ver 1b): Olas 0, 1, 2, 3 y 4. Ya no hay pantallas en "pendiente" salvo la búsqueda global del backoffice (`/app/buscar`, que ninguna ola pide construir).

**Lo que sigue**
- **Hecho · publicar el frontend** (instructivo §16.1, paso 7): sitio estático en Render, con `FRONTEND_URL` de Railway apuntando a su URL. Cada push a `main` de `SVAS-frontend` lo vuelve a desplegar. Ver `docs/despliegue-frontend.md`.
  **Consecuencia**: el backend acepta un único origen (CORS), así que `npm run dev` ya no funciona contra Railway; para desarrollar en local hay que levantar el backend local o cambiar el backend para aceptar una lista de orígenes (no hecho).
- **Recorrer en el navegador, con datos reales**, lo que escribe en producción y por eso se hace solo con permiso expreso: la cola, el caso y los seguimientos (con una cuenta ASESOR; se crea desde Usuarios), las pantallas de administración
  de la Prueba de Choque y del contenido de los planes (con el ADMINISTRADOR; un cambio afecta a todas las simulaciones nuevas y a lo que ven los clientes), y los reportes con ventas reales.

**Otros pendientes del frontend** (ninguno bloquea):
- **Vista previa del precio con descuento al negociar** ("USD 84.67 → USD 76.20"): requiere un endpoint del backend que lo calcule; el frontend no calcula dinero.
- Botón "Te llamamos" de la portada: sigue siendo un enlace `tel:` (en la computadora abre "Elegir una aplicación"). Hay que decidir si se cambia por el cuadro con el teléfono.
- Pantallas de la Ola 0 que falten por recorrer (campos, reglas de inspección, parámetros, pesos, rangos, completitud) y la Ola 1 a 360 px.
- Actualizar los textos que aún dicen "un control de suma por aseguradora" (arquitectura §4.2 y §6.9, diseño §8.3 y §9.3, dominio §14): ahora es una barra única.
- Decidir si el backend admitirá campos extra en `POST /cotizaciones` (hoy el formulario dinámico solo puede enviar `placa` y `clase`).
- Si se quiere editar fórmulas desde pantalla: `docs/propuesta-editar-formulas-desde-frontend.md` (no implementado; exige enmendar RN-40).

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
3. **Despliegue en Railway**: ✅ en línea desde el 2026-11-12 en `https://svas-production.up.railway.app`
   (Node 24.22.2, 1 réplica, US East; guía en `docs/despliegue.md`, configuración por panel). Smoke test ✅:
   `ready` 200, catálogo con 5 aseguradoras, 401 sin token, Helmet, y caso dorado (Corolla 2022) 201 desde Bruno
   (entorno `Railway`). Plan: Free Trial (USD 5 / 30 días, vence ~2026-12-12). Antes de esa fecha decidir entre
   Hobby (USD 5/mes) o Render gratis + pinger cada 10 min a `/health/live` (se duerme a los 15 min; sin el pinger
   los jobs no corren).
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

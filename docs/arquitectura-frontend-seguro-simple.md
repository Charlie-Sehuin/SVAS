# Arquitectura Frontend + Instructivo de Construcción — Documento Unificado
## Stack: TypeScript + React 18 + Vite + TailwindCSS + shadcn/ui + TanStack Query + Zustand
## Dominio: SeguroSimple — Sistema de Venta Autónoma de Seguros (SVAS)

> **Qué es este documento**: el **cómo** y el **orden** del frontend.
> Se sube junto con `contexto-dominio-seguro-simple.md` (el **qué**: manda
> ante cualquier conflicto), `arquitectura-backend-seguro-simple.md` y
> `contexto-frontend-backend-conexion-seguro-simple.md`.
>
> **Librerías fijas**: React 18, TypeScript estricto, Vite, TailwindCSS,
> shadcn/ui (Radix), TanStack Query v5, Zustand, react-hook-form + zod,
> React Router v6, `@supabase/supabase-js` (solo Auth), `ky` como cliente
> HTTP, `lucide-react` (iconos), `recharts` (reportes), `decimal.js`
> (formateo de montos que llegan como string), Vitest + Testing Library +
> MSW (pruebas; Jest es equivalente si el curso lo exige), Playwright (E2E).

---

## Índice

1. Visión general y principios de diseño
2. Sistema de diseño — paleta de colores
3. Sistema de diseño — tipografía, espaciado e iconografía
4. Sistema de diseño — componentes base y estados
5. Estructura completa de carpetas
6. Explicación detallada de cada carpeta y módulo
7. Navegación y layout por rol
8. Mapeo de pantallas
9. Gestión de estado, datos y autenticación
10. Responsividad — estrategia mobile-first
11. Accesibilidad
12. Manejo de errores, advertencias no bloqueantes y validaciones
13. Convenciones de código y checklist por feature
14. Flujo completo de una pantalla (ejemplo: Prueba de Choque)
15. Orden de despliegue (CI/CD)
16. Instructivo de construcción: configuración inicial y orden por olas
17. Siguientes pasos recomendados

---

## 1. Visión general y principios de diseño

- **Dos productos en una SPA**: (1) el **embudo público** del cliente
  (cotizar → comparar → Prueba de Choque → comprar), mobile-first, sin
  sidebar, una decisión por pantalla; (2) el **backoffice** del asesor y el
  administrador, de escritorio, con sidebar por rol y mayor densidad. Se
  separan en dos layouts (`PublicLayout`, `BackofficeLayout`) pero
  comparten design system, `shared/` y `features/`.
- **Feature-based espejo del backend**: `features/cotizacion`,
  `features/prueba-choque`, `features/compra`, `features/polizas`,
  `features/asesoria-retencion`, `features/administracion`,
  `features/reportes`, `features/seguridad`. Quien conoce
  `modules/compra/` del backend encuentra `features/compra/` sin buscar.
- **Server state ≠ UI state**: TanStack Query para todo lo que viene de la
  API; Zustand solo para estado de interfaz (paso del wizard de cotización,
  respuestas del perfil antes de enviarlas, sidebar colapsado). El
  `tokenAcceso` de la cotización anónima vive en `sessionStorage` vía un
  store pequeño, nunca en `localStorage`.
- **El catálogo manda la UI**: el formulario de cotización se genera desde
  `GET /catalogo/campos` (RF-02). Agregar un campo en el admin no requiere
  desplegar el frontend (indicador de logro de OE1).
- **La prima la calcula siempre el backend**: ni la prima mensual ni el
  efecto de mover la suma asegurada se calculan en el navegador. El control de
  suma (`<SumaAseguradaControl>`) respeta el `rangoSuma` que llega en la
  respuesta y pide al backend las primas nuevas (con *debounce*); el frontend
  solo formatea. Cada aseguradora tiene su propia fórmula (doc de dominio §17)
  y el cliente no debe conocerla ni deducirla.
- **RBAC de interfaz como reflejo, no como barrera**: se ocultan pantallas y
  botones según la matriz del doc de contexto (§14), pero la seguridad real
  vive en el backend.
- **Transparencia visible** ★: los montos que salen del bolsillo del
  cliente se tratan como dato de primer nivel. Componente único
  `<MoneyValue>`, tipografía tabular, y una escala de color propia para
  desembolsos (2.5).

```
┌──────────────────────────────────────────────────────────────┐
│  Navegador (celular del cliente · PC del asesor/admin)         │
│  React 18 + TypeScript + Vite (Vercel)                         │
├──────────────────────────────────────────────────────────────┤
│  App Shell: AuthProvider · QueryClientProvider · Router        │
│  ThemeProvider · Toaster                                       │
├──────────────────────────┬───────────────────────────────────┤
│  PublicLayout (embudo)   │  BackofficeLayout (sidebar por rol)│
├──────────────────────────┴───────────────────────────────────┤
│  features/: cotizacion · ★prueba-choque · compra · polizas      │
│  asesoria-retencion · administracion · reportes · seguridad     │
├──────────────────────────────────────────────────────────────┤
│  shared/: ui · domain components · lib/api-client · query-keys  │
│  types/api (espejo de DTOs) · utils/permissions · format        │
├──────────────────────────────────────────────────────────────┤
│  TanStack Query (servidor)   │   Zustand (UI)                   │
└───────────────────────┬──────────────────────────────────────┘
                        │ HTTPS · Bearer JWT · X-Cotizacion-Token
                        ▼
              API NestJS (Railway) — /api/v1
```

---

## 2. Sistema de diseño — paleta de colores

### 2.1 Filosofía
Un seguro se compra por confianza y se abandona por desconfianza. La paleta
debe (1) transmitir seriedad sin parecer un banco frío, (2) distinguir
claramente la **acción principal** (comprar) de la secundaria (hablar con
un asesor) sin que la secundaria parezca de segunda clase, y (3) codificar
estados y niveles de desembolso de forma reconocible sin leer. Se define con
**tokens semánticos** (`--color-*`) consumidos por Tailwind; los
componentes nunca usan hex directos.

### 2.2 Color de marca

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--color-brand-50` | `#EEF6F8` | `#0A1417` | Fondos sutiles, hover de filas |
| `--color-brand-100` | `#D3E9EE` | `#11232A` | Badges suaves, fondo de la tarjeta recomendada |
| `--color-brand-300` | `#7FB9C6` | `#2A5662` | Focus ring, bordes activos |
| `--color-brand-500` | `#14697D` | `#2F93A9` | **Primario**: botón "Comprar", links, sidebar activo |
| `--color-brand-600` | `#0F5364` | `#45A9BF` | Hover del primario |
| `--color-brand-700` | `#0B3F4C` | `#73C2D3` | Texto sobre `brand-100` |
| `--color-brand-900` | `#06252D` | `#C3E6EE` | Títulos de marca |
| `--color-accent-500` | `#E8754A` | `#F08F68` | Solo para el CTA de la Prueba de Choque y el sello "Mejor protección" |

**Justificación**: azul petróleo (entre azul de confianza y verde de
tranquilidad) distinto de los azules de Rímac/Pacífico para no parecer
canal directo de una aseguradora. El acento coral se reserva para el
diferenciador: si aparece, es la Prueba de Choque.

### 2.3 Colores semánticos de estado (un estado = un color en todo el sistema)

| Token | Claro | Oscuro | Mapea a |
|---|---|---|---|
| `--color-status-pending` | `#B7791F` | `#E3AE4F` | `solicitud PENDIENTE`, `pago PENDIENTE`, `cuota PENDIENTE` |
| `--color-status-in-progress` | `#2563EB` | `#6B9BF5` | `solicitud EN_ATENCION`, `seguimiento EN_SEGUIMIENTO` |
| `--color-status-success` | `#15803D` | `#4ADE80` | `cotizacion CONVERTIDA`, `seguimiento CONVERTIDO`, `pago CONFIRMADO` |
| `--color-status-danger` | `#B91C1C` | `#F87171` | `pago RECHAZADO`, errores |
| `--color-status-neutral` | `#6B7280` | `#9CA3AF` | `cotizacion NO_CONCRETADA`, `seguimiento DESCARTADO`, `solicitud CERRADA` |
| `--color-status-warning` | `#D97706` | `#FBBF24` | `warning` no bloqueante (aseguradora sin cotización, datos incompletos) |
| `--color-status-info` | `#0E7490` | `#22D3EE` | Derivación a asesor (RN-03/RN-04), descuento aplicado |

Contraste WCAG AA verificado con `axe-core` en la Ola 0.

### 2.4 Neutros y superficie

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--color-bg-canvas` | `#F6F8F9` | `#0B0E10` | Fondo general |
| `--color-bg-surface` | `#FFFFFF` | `#14191C` | Cards, tablas, modales |
| `--color-bg-surface-muted` | `#EFF2F4` | `#1C2327` | Filas alternadas |
| `--color-border-default` | `#DCE2E6` | `#2A3237` | Bordes |
| `--color-text-primary` | `#0F1A1F` | `#E8EEF1` | Texto principal |
| `--color-text-secondary` | `#4B5A62` | `#A7B4BB` | Texto secundario |

### 2.5 ★ Escala de desembolso (Prueba de Choque)

Escala secuencial de 4 pasos, usada **solo** para lo que paga el cliente en
un escenario. Nunca se usa para estados.

| Token | Claro | Oscuro | Regla |
|---|---|---|---|
| `--color-out-0` | `#E6F4EA` | `#14271B` | Desembolso = 0 |
| `--color-out-1` | `#FFF4D6` | `#2C2412` | ≤ 10 % del daño |
| `--color-out-2` | `#FFE0C7` | `#33200F` | 10–50 % del daño |
| `--color-out-3` | `#FBD0CC` | `#3A1714` | > 50 % del daño o no cubierto |
| `--color-out-unknown` | patrón rayado sobre `bg-surface-muted` | ídem | Sin información (RN-30) |

El color **siempre** va acompañado del monto y de un texto ("Pagas
USD 150"), nunca solo.

### 2.6 Tailwind

```ts
// design-system/tailwind.config.ts (extracto)
theme: { extend: { colors: {
  brand: { 50:'var(--color-brand-50)', 100:'var(--color-brand-100)', 500:'var(--color-brand-500)', … },
  accent: 'var(--color-accent-500)',
  status: { pending:'var(--color-status-pending)', progress:'var(--color-status-in-progress)',
            success:'var(--color-status-success)', danger:'var(--color-status-danger)',
            neutral:'var(--color-status-neutral)', warning:'var(--color-status-warning)',
            info:'var(--color-status-info)' },
  out: { 0:'var(--color-out-0)', 1:'var(--color-out-1)', 2:'var(--color-out-2)',
         3:'var(--color-out-3)' },
}}}
```

---

## 3. Sistema de diseño — tipografía, espaciado e iconografía

### 3.1 Tipografía
- **Familia**: `Inter` (UI) con `font-feature-settings: 'tnum'` en
  montos; `JetBrains Mono` solo para número de póliza y referencias.
- **Escala embudo (móvil)**: título 24/32 semibold, cuerpo 16/24 (nunca
  menos de 16 px en inputs para evitar el zoom de iOS), montos grandes
  28/32 bold.
- **Escala backoffice**: título 20/28, cuerpo 14/20, tablas 14/20.

### 3.2 Espaciado
Base 4 px. Embudo: padding lateral 16 px, separación entre bloques 24 px,
botón principal de alto 48 px y ancho completo en móvil. Backoffice:
padding 24 px, filas de tabla 44 px.

### 3.3 Iconografía (`lucide-react`)
| Concepto | Icono |
|---|---|
| Comprar / Opción 1 | `ShoppingCart` |
| Asesor / Opción 2 | `Headset` |
| Prueba de Choque ★ | `ShieldAlert` |
| Escenarios ★ | `Car` (choque), `Wrench` (taller), `KeyRound` (robo), `Users` (terceros), `Ban` (pérdida total) |
| WhatsApp / Llamada | `MessageCircle` / `Phone` |
| Póliza | `FileText` |
| Cuotas | `CalendarClock` |

### 3.4 Radios y elevación
`rounded-xl` en tarjetas de plan, `rounded-lg` en inputs, sombra solo en la
tarjeta del plan seleccionado y en modales.

---

## 4. Sistema de diseño — componentes base y estados

### 4.1 Librería base
shadcn/ui: `Button`, `Input`, `Select`, `RadioGroup`, `Checkbox`, `Dialog`,
`Sheet` (paneles en móvil), `Tabs`, `Table`, `Badge`, `Tooltip`, `Toast`
(sonner), `Skeleton`, `Progress`, `Accordion`.

### 4.2 Componentes de dominio (`shared/ui/domain/`)

| Componente | Qué hace |
|---|---|
| `<MoneyValue value="480.00" />` | Formatea string decimal con moneda de `parametros`; tabular |
| `<StatusBadge entity="solicitud" value="PENDIENTE" />` | Color y texto según tabla 2.3; única fuente de verdad de estados |
| `<DynamicField campo={…} />` | Renderiza `TEXTO`/`NUMERO`/`LISTA` desde el catálogo |
| `<PlanCard prima opciones … />` | Plan con **prima mensual destacada** ("USD 53.37 / mes"), prima anual y suma asegurada vigente, aseguradora, `resumen` del plan y botones "Ver detalle" (abre `<DetallePlanDrawer>`) y "Comparar" (casilla; máx. 3), Opción 1/2 según `opciones`; si `disponible = false`, tarjeta gris con el texto del `motivoNoDisponible` |
| `<SumaAseguradaControl rango suma onCommit />` | Slider + input numérico entre `rangoSuma.minima` y `rangoSuma.maxima`; *debounce* de 400 ms; al confirmar llama `PATCH …/suma-asegurada` y pinta las primas devueltas (RN-37). Uno por aseguradora (sus 2 planes comparten suma). Se deshabilita con 409 |
| `<DesgloseCalculo detalle />` | Tabla "tasa base × pesos = tasa → prima" para ASESOR/ADMIN (RN-41); **nunca** para CLIENTE |
| `<SimulacionDesactualizadaBanner />` | Aviso ámbar + botón "Volver a simular" cuando `simulacion.vigente = false` |
| ★ `<DetallePlanDrawer planId />` | Panel (en móvil, pantalla completa) con la descripción del plan y tres pestañas: *Qué cubre* (coberturas con `incluida`), *Qué no cubre* (coberturas con ✗ + exclusiones) y *Requisitos*. Lee `GET /planes/:planId/contenido`; muestra `<ContenidoLeyenda>` |
| ★ `<CoberturaItem cobertura />` | Una fila de cobertura: icono ✓ o ✗ **más texto** ("Incluida" / "No incluida"), nombre y `detalle` ("Hasta USD 100,000"). Nunca solo color (sección 11) |
| ★ `<MatrizCoberturas planes filas />` | Tabla cobertura × plan del comparador (máx. 3 planes). Pinta `filas` en el orden recibido; primera columna fija en móvil con scroll horizontal |
| ★ `<ContenidoLeyenda />` | «Contenido ilustrativo; no es el condicionado de la aseguradora» (RN-46); no se puede ocultar |
| `<OptionGate opciones motivoDerivacion />` | Muestra/oculta Opción 1 y el aviso de derivación |
| `<WarningToast warning />` | Toast ámbar para `warning` |
| `<ErrorToast error />` | Toast rojo con `message` del backend tal cual |
| `<RoleGate roles={['ADMINISTRADOR']}>` | Oculta contenido por rol |
| `<ContactChannelPicker />` | Llamada / WhatsApp, obligatorio (RF-01) |
| `<DemoLegend />` | «Documento de demostración sin validez legal» (RNF-20) |
| ★ `<OutOfPocketCell amount damage />` | Celda con escala 2.5 |
| ★ `<CostoRealBar prima esperado />` | Barra apilada prima + desembolso esperado |
| ★ `<ScenarioCard escenario resultados />` | Tarjeta de escenario con resultado por plan |
| ★ `<SimulationDisclaimer />` | Leyenda RN-29, no se puede ocultar |
| `<AttemptCounter usados max diasRestantes />` | "Intento 2 de 4 · quedan 5 días" |

### 4.3 Estados obligatorios de cada componente que consume datos
`loading` (skeleton con la forma final, no spinner genérico), `empty`
(mensaje + acción), `error` (`ErrorToast` + botón reintentar), `success`.
Para la primera request tras inactividad del backend, mostrar después de 4 s
"Estamos despertando el servidor, puede tardar unos segundos".

---

## 5. Estructura completa de carpetas

```
svas-frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── router.tsx
│   │
│   ├── app-shell/
│   │   ├── PublicLayout.tsx            # header simple + stepper del embudo
│   │   ├── BackofficeLayout.tsx        # sidebar + topbar
│   │   ├── Sidebar.tsx
│   │   ├── Topbar.tsx
│   │   ├── RoleNavigationConfig.ts     # menú por rol (sección 7)
│   │   └── store/useSidebarStore.ts
│   │
│   ├── auth/
│   │   ├── AuthProvider.tsx            # sesión Supabase, refresh automático
│   │   ├── RoleGuard.tsx               # guard de ruta por rol
│   │   ├── useAuth.ts
│   │   ├── LoginPage.tsx
│   │   ├── RegistroMinimoDialog.tsx    # registro dentro del embudo (CU-02 / CU-03)
│   │   └── UnauthorizedPage.tsx
│   │
│   ├── design-system/
│   │   ├── tokens/colors.css · typography.css · spacing.css
│   │   ├── tailwind.config.ts
│   │   └── ThemeProvider.tsx
│   │
│   ├── shared/
│   │   ├── ui/ (shadcn) + ui/domain/ (sección 4.2)
│   │   ├── hooks/ useDebouncedValue.ts · useMediaQuery.ts · useWakeUpNotice.ts
│   │   ├── lib/
│   │   │   ├── supabase.ts             # createClient(URL, ANON_KEY) — solo Auth
│   │   │   ├── api-client.ts           # ky + JWT + X-Cotizacion-Token + errores tipados
│   │   │   ├── query-client.ts
│   │   │   ├── query-keys.ts
│   │   │   └── format.ts               # moneda, fecha (America/Lima), documento enmascarado
│   │   ├── stores/useCotizacionTokenStore.ts   # sessionStorage
│   │   ├── types/api/ (un archivo por módulo, espejo de los DTOs) · roles.types.ts · enums.ts
│   │   └── utils/permissions.ts        # hasRole(), canAccessScreen()
│   │
│   ├── features/
│   │   ├── landing/
│   │   │   └── LandingPage.tsx         # propuesta de valor + "Cotiza en 1 minuto"
│   │   │
│   │   ├── cotizacion/                 # Ola 1
│   │   │   ├── api/cotizacion.api.ts
│   │   │   ├── hooks/ useCamposCatalogo.ts · useCotizar.ts · useResumenCotizacion.ts
│   │   │   │          useCatalogoVehiculos.ts · useUbigeos.ts · useActualizarSuma.ts
│   │   │   ├── schema/buildZodSchema.ts   # zod dinámico desde el catálogo
│   │   │   ├── store/useCotizarWizardStore.ts
│   │   │   ├── components/ CotizarWizard.tsx · PasoVehiculo.tsx · PasoUbicacion.tsx
│   │   │   │               PasoContacto.tsx · ComparativoPlanes.tsx · DerivacionBanner.tsx
│   │   │   │               SelectorVehiculoCascada.tsx · SelectorUbigeoCascada.tsx
│   │   │   │               SumaAseguradaControl.tsx
│   │   │   └── pages/ CotizarPage.tsx · ComparativoPage.tsx · MisCotizacionesPage.tsx
│   │   │
│   │   ├── planes/                     # Ola 2 ★ — contenido comercial (doc de dominio §18)
│   │   │   ├── api/planes.api.ts
│   │   │   ├── hooks/ usePlanContenido.ts · useCompararPlanes.ts
│   │   │   ├── store/useCompararPlanesStore.ts      # ids marcados para comparar (máx. 3)
│   │   │   ├── components/ DetallePlanDrawer.tsx · CoberturaItem.tsx · MatrizCoberturas.tsx
│   │   │   │               CompararPlanesBar.tsx · CompararPlanesDialog.tsx
│   │   │   └── pages/ CompararPlanesPage.tsx        # /comparar?ids=…
│   │   │
│   │   ├── prueba-choque/              # Ola 2 ★
│   │   │   ├── api/pruebaChoque.api.ts
│   │   │   ├── hooks/ useEscenarios.ts · useEjecutarPruebaChoque.ts · useUltimaSimulacion.ts
│   │   │   ├── store/usePerfilRiesgoStore.ts
│   │   │   ├── components/
│   │   │   │   ├── PerfilRiesgoSheet.tsx    # 3 preguntas + ingreso diario (si comercial) + chips
│   │   │   │   ├── RankingCostoReal.tsx
│   │   │   │   ├── MatrizEscenarios.tsx     # tabla en desktop, carrusel de tarjetas en móvil
│   │   │   │   ├── PeorCasoCallout.tsx
│   │   │   │   ├── DiasSinTrabajar.tsx      # solo Segmento B
│   │   │   │   └── CompartirResultado.tsx   # descarga PDF 1 página
│   │   │   └── pages/PruebaChoquePage.tsx
│   │   │
│   │   ├── compra/                     # Ola 3
│   │   │   ├── api/compra.api.ts
│   │   │   ├── components/ ResumenCompra.tsx · CamposFaltantesForm.tsx · FirmaSimulada.tsx
│   │   │   │               SelectorModoPago.tsx · CronogramaCuotas.tsx · EstadoPago.tsx
│   │   │   └── pages/ CompraPage.tsx (wizard) · ConfirmacionPage.tsx
│   │   │
│   │   ├── polizas/                    # Ola 3
│   │   │   └── pages/ MisPolizasPage.tsx · (descarga vía blob)
│   │   │
│   │   ├── asesoria-retencion/         # Ola 2
│   │   │   ├── cliente/ SolicitarAsesoriaDialog.tsx · EstadoSolicitudCard.tsx
│   │   │   ├── asesor/
│   │   │   │   ├── pages/ ColaAsesoriaPage.tsx · CasoDetallePage.tsx · SeguimientosPage.tsx
│   │   │   │   │          SeguimientoDetallePage.tsx
│   │   │   │   └── components/ NegociarDescuentoForm.tsx · RegistrarIntentoForm.tsx
│   │   │   │                   CerrarSeguimientoDialog.tsx · SimulacionDelCaso.tsx ★
│   │   │   └── retoma/RetomaPage.tsx   # /retoma/:token
│   │   │
│   │   ├── administracion/             # Ola 0 (catálogo y tarifas) + Ola 2 (reglas y contenido de planes ★)
│   │   │   ├── pages/ AseguradorasPlanesPage.tsx · CamposRequeridosPage.tsx
│   │   │   │          ReglasInspeccionPage.tsx · ParametrosPage.tsx · UsuariosPage.tsx
│   │   │   │          BitacoraPage.tsx
│   │   │   ├── tarifas/        # doc de dominio §17 (solo ADMINISTRADOR)
│   │   │   │   ├── TarifasPlanesPage.tsx        # tasa base y parámetros propios de cada plan
│   │   │   │   ├── TarifasPesosPage.tsx         # pestañas marca · modelo · año · tipo · ubigeo (solo las que usa la aseguradora)
│   │   │   │   ├── TarifasRangosSumaPage.tsx    # rango mín–máx por modelo y año
│   │   │   │   ├── SimuladorTarifaPage.tsx      # vehículo + suma → primas y desglose de las 5 aseguradoras
│   │   │   │   └── CompletitudTarifasPage.tsx   # qué modelo-año no cotiza y por qué
│   │   │   ├── planes-contenido/ # doc de dominio §18 (solo ADMINISTRADOR)
│   │   │   │   ├── ContenidoPlanPage.tsx        # editor de un plan: Descripción · Coberturas (13 interruptores) · Exclusiones · Requisitos
│   │   │   │   ├── CoberturasCatalogoPage.tsx   # catálogo común de coberturas
│   │   │   │   └── CompletitudContenidoPage.tsx # qué plan está incompleto o contradice a la Prueba de Choque
│   │   │   └── prueba-choque/ EscenariosPage.tsx · DeduciblesTopesPage.tsx (matriz plan × escenario editable)
│   │   │                      FrecuenciasPage.tsx · ZonasPage.tsx · FactoresPage.tsx
│   │   │
│   │   ├── dashboard/
│   │   │   ├── DashboardPage.tsx
│   │   │   └── widgets/ AsesorColaWidget.tsx · AsesorSeguimientoWidget.tsx · AdminKpiWidget.tsx
│   │   │
│   │   └── reportes/                   # Ola 4
│   │       └── pages/ VentasPage.tsx · RetencionPage.tsx · DescuentosPage.tsx
│   │                  ImpactoPruebaChoquePage.tsx ★
│   │
│   └── test/ (msw handlers, factories)
├── e2e/ (Playwright: embudo completo en viewport 360×740)
├── index.html
├── .env.example                        # VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
└── package.json
```

---

## 6. Explicación detallada de cada carpeta y módulo

### 6.1 `main.tsx` / `App.tsx`
Monta `ThemeProvider` → `QueryClientProvider` → `AuthProvider` →
`RouterProvider` → `Toaster`. `ReactQueryDevtools` solo en desarrollo.

### 6.2 `router.tsx`
```
/                        LandingPage                       público
/cotizar                 CotizarPage                       público
/cotizacion/:id          ComparativoPage                   token o CLIENTE
/cotizacion/:id/prueba   PruebaChoquePage ★                token o CLIENTE
/comparar?ids=a,b,c      CompararPlanesPage ★              público
/compra/:cotizacionId    CompraPage                        CLIENTE (registro en el paso 1)
/compra/:id/listo        ConfirmacionPage                  CLIENTE
/retoma/:token           RetomaPage                        público
/mi-cuenta/*             MisCotizaciones · MisPolizas      CLIENTE
/login                   LoginPage
/app                     DashboardPage                     ASESOR, ADMINISTRADOR
/app/asesorias[/:id]     Cola / Caso                       ASESOR (ADMIN lectura)
/app/seguimientos[/:id]  Seguimientos                      ASESOR (ADMIN lectura)
/app/admin/*             Administración                    ADMINISTRADOR
  /app/admin/planes/:planId/contenido   ContenidoPlanPage ★
  /app/admin/coberturas                 CoberturasCatalogoPage ★
  /app/admin/contenido/completitud      CompletitudContenidoPage ★
/app/reportes/*          Reportes                          ASESOR (propio), ADMINISTRADOR
```
Rutas con `lazy()` por feature para que el embudo móvil cargue solo lo suyo
(meta: JS inicial del embudo < 180 KB gzip).

### 6.3 `app-shell/`
`PublicLayout`: logo, stepper (Cotizar · Comparar · Comprar), botón
"Hablar con un asesor" siempre visible. `BackofficeLayout`: sidebar por
rol + topbar con búsqueda por número de cotización o documento (solo
ASESOR/ADMIN).

### 6.4 `auth/`
`AuthProvider` usa `supabase.auth.onAuthStateChange` y expone `{ user,
roles, session, signIn, signOut }`. Los roles se leen de
`session.user.app_metadata.roles`. `RegistroMinimoDialog` (nombre, email,
contraseña) aparece dentro del embudo, nunca redirige fuera: al terminar
llama `PATCH /cotizaciones/:id/cliente` y continúa en el mismo paso.

### 6.5 `design-system/`
Tokens de las secciones 2–3. Modo oscuro solo en backoffice (el embudo
respeta `prefers-color-scheme`).

### 6.6 `shared/`
- `api-client.ts`: añade `Authorization` si hay sesión, si no añade
  `X-Cotizacion-Token` cuando la ruta lo requiere; en 401 intenta un
  refresh una vez; convierte la forma de error del backend en `ApiError {
  statusCode, message, correlationId }`.
- `query-keys.ts`: `qk.cotizacion.resumen(id)`, `qk.pruebaChoque.ultima(id)`,
  `qk.asesorias.cola(filtros)`, `qk.planes.contenido(planId)`,
  `qk.planes.comparar(ids)`, etc.
- `types/api/*`: espejo 1:1 de los DTOs; montos como `string`.

### 6.7 `features/<modulo>/`
Misma forma: `api/` (funciones puras sobre `api-client`), `hooks/`
(TanStack Query), `components/`, `pages/`, opcionalmente `store/` y
`schema/`. Ningún componente llama `fetch` directo.

### 6.8 ★ `features/prueba-choque/`
- `PerfilRiesgoSheet` es un `Sheet` inferior en móvil con 3 toggles grandes
  y, si el uso es comercial, un input "¿Cuánto ganas al día? (S/)".
- `MatrizEscenarios`: en ≥ 768 px tabla plan × escenario con
  `<OutOfPocketCell>`; en móvil, carrusel de `<ScenarioCard>` (un escenario
  por tarjeta, planes como filas) para no forzar scroll horizontal.
- `RankingCostoReal`: lista ordenada con `<CostoRealBar>`; el primero
  completo recibe el sello coral "Mejor protección por tu dinero"; los
  incompletos llevan badge "Información incompleta".
- Desde cada plan: "Comprar este plan" (si `COMPRA_INMEDIATA` está en
  `opciones`) y "Hablar con un asesor sobre esto" (abre
  `SolicitarAsesoriaDialog` con motivo `DUDA` precargado).

### 6.9 `features/cotizacion` — selectores en cascada y suma asegurada

- **Vehículo**: `SelectorVehiculoCascada` encadena marca → modelo → año con
  `GET /catalogo/vehiculos/*`; al cambiar la marca se limpian modelo y año. El
  **tipo** de vehículo no se pregunta (el backend lo deduce del modelo).
- **Ubicación**: `SelectorUbigeoCascada` (departamento → provincia →
  distrito); el valor que se envía es el `ubigeo` de 6 dígitos.
- **Suma asegurada** (en `ComparativoPage`): cada aseguradora muestra su
  tarjeta con su propio control.

```
Rímac  ·  Suma asegurada  [──────●─────]  USD 15,000     (rango 12,000 – 16,800)
   Plata   USD 38.12 / mes   (USD 457.43 al año)
   Oro     USD 53.37 / mes   (USD 640.40 al año)   [Comprar] [Hablar con asesor]
```

- **Flujo**: el usuario suelta el control →
  `useActualizarSuma.mutate({ aseguradoraId, sumaAsegurada })` (*debounce*
  400 ms) → `PATCH …/aseguradoras/:id/suma-asegurada` → `onSuccess` reemplaza
  las primas de **esa** aseguradora en la caché (`qk.cotizacion.resumen(id)`) y,
  si llega `warning SIMULACION_DESACTUALIZADA`, invalida
  `qk.pruebaChoque.ultima(id)`. Mientras llega la respuesta se muestra el
  esqueleto del monto, **nunca** un monto calculado en el cliente.
- **Errores**: 400 fuera de rango (no debería ocurrir porque el control tiene
  `min`/`max`; se muestra el mensaje del backend) y 409 compra en curso (se
  deshabilita el control y se explica por qué).
- **Tarjeta no disponible** (`disponible = false`): gris, sin control, con el
  texto según `motivoNoDisponible` (`SIN_RANGO`: "no cotiza este vehículo").
- **Prima mensual**: título grande ("USD 53.37 / mes"); la anual, secundaria.
  En compra, el selector de modo de pago muestra el total y la cuota que
  devuelve `GET /compras/resumen` (incluye el recargo de La Positiva); no se
  suma ni se divide nada en el navegador.

### 6.10 ★ `features/administracion/tarifas`

Pantallas solo para ADMINISTRADOR (explicación de las tablas en el doc de
dominio §17):

- `TarifasPlanesPage`: los 10 planes con su tasa base editable y los
  parámetros propios (`cargo_fijo_anual`, `recargo_pago_mensual`,
  `prima_minima_anual`, `descuento_comercial`); el formulario se genera según
  la aseguradora.
- `TarifasPesosPage`: pestañas marca · modelo · año · tipo · ubigeo; solo se
  muestran las que la aseguradora usa. Edición en línea y carga CSV;
  validación 0,500–3,000.
- `TarifasRangosSumaPage`: filtros por marca y modelo; edición de suma mínima
  y máxima por año.
- `SimuladorTarifaPage`: elige modelo, año, ubigeo y suma → tabla con las 10
  primas (anual y mensual) y, desplegable, el `<DesgloseCalculo>` de cada una.
  Sirve para comprobar a mano que un peso o una fórmula quedó bien.
- `CompletitudTarifasPage`: modelos-año sin rango o con pesos faltantes por
  aseguradora.

### 6.11 ★ `features/planes` y `administracion/planes-contenido`

Explican qué cubre cada plan (tablas y contenido en el doc de dominio, sección
18). El frontend **no decide nada**: ordena como llega, muestra ✓/✗ según
`incluida` y no deduce coberturas.

**Cliente (público)**
- En `ComparativoPage`, cada `PlanCard` muestra `resumen` y el botón "Ver
  detalle" → `DetallePlanDrawer` → `usePlanContenido(planId)`
  (`staleTime` 10 min). Pestañas: *Qué cubre* (solo `incluida: true`, con
  `detalle`), *Qué no cubre* (`incluida: false` **y** `exclusiones`) y
  *Requisitos*. Debajo, `<ContenidoLeyenda>`.
- "Comparar": casilla en cada tarjeta; `useCompararPlanesStore` guarda hasta
  3 ids (la cuarta casilla queda deshabilitada con el texto "Máximo 3
  planes"). `CompararPlanesBar` (fija abajo) abre `CompararPlanesDialog` →
  `useCompararPlanes(ids)` → `<MatrizCoberturas>`. Se puede compartir como
  `/comparar?ids=…`.
- Si `resumen` llega `null` (contenido aún no cargado), la tarjeta no muestra
  "Ver detalle" ni "Comparar".
- En `CompraPage` (resumen) y en la confirmación se muestra `contenidoPlan`
  de la orden con el texto "Este es el contenido del plan que contrataste el
  {fecha}" (RN-45).

```
Plan Oro · Rímac                                    [Ver detalle] [☐ Comparar]
  "Cobertura ampliada con lunas, autopartes y asistencia completa"

  ┌ Qué cubre ┐ ┌ Qué no cubre ┐ ┌ Requisitos ┐
  ✓ Daño por choque o vuelco
  ✓ Responsabilidad civil        Hasta USD 200,000
  ✓ Vehículo de reemplazo        Hasta 10 días
  …
  Contenido ilustrativo; no es el condicionado de la aseguradora.
```

**Administrador**
- `ContenidoPlanPage` (`/app/admin/planes/:planId/contenido`): un formulario
  con cuatro pestañas — *Descripción* (resumen ≤ 160 caracteres, descripción,
  ideal para), *Coberturas* (las 13 del catálogo como interruptor "Incluida"
  + campos `detalle` y `limiteMonto` que se habilitan solo si está incluida),
  *Exclusiones* (lista ordenable) y *Requisitos* (tipo, texto, obligatorio).
  Un solo botón **Guardar** envía todo con `PUT /admin/planes/:planId/contenido`
  (todo o nada). La respuesta trae las advertencias `CONTENIDO_INCOHERENTE`
  (RN-43), que se listan arriba del formulario con el nombre de la cobertura.
- Un contador "n de 13 coberturas definidas" impide guardar si falta alguna
  (RN-42); el backend lo vuelve a validar.
- Al activar un plan (`AseguradorasPlanesPage`), un 400 `CONTENIDO_INCOMPLETO`
  muestra "No puedes activar este plan: faltan {n} coberturas por definir" con
  enlace a `ContenidoPlanPage`.
- `CoberturasCatalogoPage`: alta/edición de coberturas del catálogo; al crear
  una nueva activa, avisa que todos los planes activos quedarán incompletos
  hasta definir su fila.
- `CompletitudContenidoPage`: tabla por plan (faltantes, incoherencias,
  último cambio) con enlace a su editor.

---

## 7. Navegación y layout por rol

### 7.1 Sidebar dinámico (backoffice)

```
📊 Dashboard
─────────────
🎧 ATENCIÓN                     (ASESOR; ADMIN lectura)
  Cola de asesoría
  Seguimiento / retención
─────────────
🗂️ CATÁLOGO                      (ADMINISTRADOR)
  Aseguradoras y planes
  Campos requeridos
  Reglas de inspección
  Parámetros comerciales
  Contenido de planes ★
  Coberturas (catálogo) ★
  Tarifas por aseguradora
  Simulador de tarifa
─────────────
🛡️ PRUEBA DE CHOQUE ★           (ADMINISTRADOR)
  Escenarios
  Deducibles y topes por plan
  Frecuencias y zonas
  Factores de perfil
─────────────
📈 REPORTES                      (ASESOR: mi desempeño · ADMIN: todos)
─────────────
⚙️ SISTEMA                       (ADMINISTRADOR)
  Usuarios y roles
  Bitácora
```
Un grupo sin ítems visibles para el rol no se renderiza.

### 7.2 Menú del cliente
El CLIENTE no usa sidebar: menú de cuenta en el header con "Mis
cotizaciones", "Mis pólizas", "Cerrar sesión".

### 7.3 `<RoleGate>`
```tsx
<CasoDetalle>
  <DatosCliente documento={caso.cliente.numeroDocumento /* ya viene enmascarado o no según rol */} />
  <RoleGate roles={['ASESOR']}>
    {caso.estado === 'EN_ATENCION' && <NegociarDescuentoForm max={caso.descuentoMaximo} />}
  </RoleGate>
  <SimulacionDelCaso cotizacionId={caso.cotizacionId} />
</CasoDetalle>
```
El enmascarado lo hace el backend; el frontend solo pinta.

---

## 8. Mapeo de pantallas

| Pantalla | Ruta | Feature | Endpoints principales | CU / RF |
|---|---|---|---|---|
| Landing | `/` | landing | — | — |
| Cotizar (wizard 3 pasos) | `/cotizar` | cotizacion | `GET /catalogo/campos`, `GET /catalogo/vehiculos/*`, `GET /catalogo/ubigeos/*`, `POST /cotizaciones` | CU-01, RF-01..07 |
| Comparativo | `/cotizacion/:id` | cotizacion | `GET /cotizaciones/:id/resumen` | RF-05, RF-08, RF-10 |
| ★ Detalle del plan | `/cotizacion/:id` (panel desde la tarjeta) | planes | `GET /planes/:planId/contenido` | RN-42..46 |
| ★ Comparar planes | `/comparar?ids=` | planes | `GET /planes/comparar?ids=` | RN-42, RN-46 |
| Ajustar suma asegurada | `/cotizacion/:id` (control en la tarjeta de cada aseguradora) | cotizacion | `PATCH /cotizaciones/:id/aseguradoras/:aseguradoraId/suma-asegurada` | RN-37, RN-38 |
| ★ Prueba de Choque | `/cotizacion/:id/prueba` | prueba-choque | `GET /prueba-choque/escenarios`, `POST/GET /cotizaciones/:id/prueba-choque` | RF-34, RF-35 |
| Solicitar asesoría | diálogo | asesoria-retencion | `POST /asesorias` | CU-03, RF-11, RF-12 |
| Compra (datos → firma → pago) | `/compra/:id` | compra | `GET campos-faltantes`, `PUT datos`, `POST /compras`, `POST pago` | CU-02, RF-09, RF-22..24 |
| Confirmación + póliza | `/compra/:id/listo` | compra/polizas | `GET /compras/:id/estado`, `GET /polizas/:id/pdf` | RF-25, RF-26 |
| Retoma | `/retoma/:token` | asesoria-retencion | `GET /retoma/:token` | RF-21, RN-12 |
| Mis cotizaciones / pólizas | `/mi-cuenta/*` | cotizacion/polizas | `GET /cotizaciones/mias`, `GET /polizas/mias` | RF-26 |
| Cola de asesoría | `/app/asesorias` | asesoria-retencion | `GET /asesorias/cola`, `POST /:id/tomar` | CU-03, RF-13, RN-13 |
| Caso | `/app/asesorias/:id` | asesoria-retencion | `GET /asesorias/:id`, `POST descuentos`, `POST resultado` | RF-14, RF-15 |
| Seguimientos | `/app/seguimientos` | asesoria-retencion | `GET /seguimientos`, `POST intentos`, `POST cierre` | CU-04, RF-16..21 |
| Catálogo y parámetros | `/app/admin/*` | administracion | `/admin/*` | CU-05, RF-27..29 |
| Tarifas por aseguradora | `/app/admin/tarifas/*` | administracion | `/admin/tarifas/planes`, `/pesos/:tabla`, `/rangos-suma`, `/completitud` | RF-27..29, RN-40 |
| Simulador de tarifa | `/app/admin/tarifas/simulador` | administracion | `POST /admin/tarifas/simular` | RN-41 |
| ★ Contenido de planes | `/app/admin/planes/:planId/contenido`, `/app/admin/coberturas`, `/app/admin/contenido/completitud` | administracion | `GET/PUT /admin/planes/:planId/contenido`, `/admin/coberturas`, `/admin/contenido-planes/completitud` | RN-42..46 |
| ★ Reglas de Prueba de Choque | `/app/admin/prueba-choque/*` | administracion | `/admin/prueba-choque/*` | RF-36 |
| Reportes | `/app/reportes/*` | reportes | `/admin/reportes/*` | RF-30, RF-38 |
| Usuarios / Bitácora | `/app/admin/usuarios`, `/bitacora` | administracion | `/admin/usuarios`, `/admin/bitacora` | RF-31 |

---

## 9. Gestión de estado, datos y autenticación

### 9.1 TanStack Query
- `staleTime`: catálogo 10 min; resumen de cotización 30 s; colas 15 s con
  `refetchInterval` 30 s solo mientras la pestaña está visible.
- Mutaciones invalidan claves concretas: tomar caso → `qk.asesorias.cola`;
  confirmar pago → `qk.compra.estado`, `qk.polizas.mias`.
- `retry`: 1 para GET; 0 para mutaciones (el pago usa `Idempotency-Key`
  generado una vez por intento de pago con `crypto.randomUUID()`).
- Catálogo de vehículos y ubigeos: `staleTime` 1 h (cambian por seed/admin).
- Contenido de planes (`qk.planes.*`): `staleTime` 10 min; guardar contenido en administración invalida `qk.planes.contenido(planId)` y `qk.planes.comparar`.
- Ajustar suma: `useActualizarSuma` (*debounce* 400 ms, sin `retry`);
  `onSuccess` hace `setQueryData(qk.cotizacion.resumen(id))` con las primas
  devueltas y, si llega `SIMULACION_DESACTUALIZADA`,
  `invalidateQueries(qk.pruebaChoque.ultima(id))`.

### 9.2 Zustand
`useCotizarWizardStore` (paso actual y borrador, persistido en
`sessionStorage` para que un refresh no borre lo escrito),
`usePerfilRiesgoStore` ★, `useCotizacionTokenStore`, `useSidebarStore`.

### 9.3 Autenticación
Supabase Auth en el navegador solo para sesión (login, refresh, logout).
Todas las demás llamadas van a la API NestJS con el `access_token`. La
`SERVICE_ROLE_KEY` no existe en el frontend.

### 9.4 Formularios
react-hook-form + zod. El esquema del formulario de cotización se construye
en tiempo de ejecución desde el catálogo:

```ts
function campoToZod(c: CampoCatalogo): z.ZodTypeAny {
  const base =
    c.tipo === 'NUMERO' ? z.coerce.number() :
    c.tipo === 'LISTA'  ? z.enum(c.valoresPermitidos as [string, ...string[]]) :
                          z.string().trim().min(1, `${c.nombre} es obligatorio`);
  return c.obligatorio ? base : base.optional();
}
export function buildZodSchema(campos: CampoCatalogo[]) {
  return z.object(Object.fromEntries(campos.map(c => [c.nombre, campoToZod(c)])));
}
```
El backend vuelve a validar (RF-03) y sus errores por campo se asignan con
`setError(campo, …)`.

Los campos con `origenValores = 'CATALOGO'` (`marca`, `modelo`, `anio`,
`ubigeo`) no usan `valoresPermitidos`: `buildZodSchema` los trata como
`z.string().uuid()` (ids) o `z.string().regex(/^\d{6}$/)` (ubigeo), y
`PasoVehiculo`/`PasoUbicacion` los renderizan con los selectores en cascada de
6.9. El campo `tipo` nunca se muestra: lo completa el backend.

---

## 10. Responsividad — estrategia mobile-first

### 10.1 Breakpoints
`base` 360 px (diseño de referencia, RNF-07) · `sm` 640 · `md` 768 ·
`lg` 1024 · `xl` 1280.

### 10.2 Reglas por tipo de pantalla
| Tipo | Móvil | Escritorio |
|---|---|---|
| Embudo | Una columna, CTA fijo abajo (`sticky bottom-0`), un paso por pantalla | Columna central de 640 px + resumen lateral |
| Comparativo | Tarjetas apiladas; filtro por aseguradora en `Sheet` | Grid de 3 columnas |
| ★ Detalle y comparador de planes | `DetallePlanDrawer` a pantalla completa; `MatrizCoberturas` con primera columna fija y scroll horizontal | Panel lateral de 480 px; matriz completa |
| ★ Prueba de Choque | Ranking + carrusel de escenarios | Ranking + matriz completa |
| Backoffice | Funcional pero no prioritario (ASESOR/ADMIN usan PC) | Sidebar fijo, tablas densas |

### 10.3 Meta medible
Compra autónoma completa en un móvil de gama media en ≤ 10 min (RNF-07):
se mide en Playwright con viewport 360×740 y CPU throttling 4×.

---

## 11. Accesibilidad

- WCAG 2.1 AA. `axe-core` en CI sobre las pantallas del embudo.
- Todo color de estado o desembolso lleva texto. En el contenido de planes, ✓/✗ siempre van con "Incluida" / "No incluida" (en la matriz comparativa, como texto para lector de pantalla).
- Foco visible (`ring-brand-300`), orden de tabulación lógico en el wizard.
- `aria-live="polite"` para el resultado del pago y para los `warning`.
- Objetivos táctiles ≥ 44×44 px.
- Montos leídos completos por lectores de pantalla (`aria-label="480
  dólares"`), no "USD 480.00".

---

## 12. Manejo de errores, advertencias no bloqueantes y validaciones

### 12.1 Tres niveles, nunca mezclados
1. **Optimista** (zod / estado deshabilitado): no se llama al backend.
2. **Advertencia no bloqueante** (`<WarningToast>`): la operación **sí**
   se ejecutó y devolvió `warning`.
3. **Error real** (`<ErrorToast>`): no se ejecutó; se muestra `message`
   tal cual llega del backend, con el `correlationId` copiable en el detalle.

### 12.2 Tabla de implementación

| Regla | Componente | Nivel |
|---|---|---|
| RF-03 campos | `buildZodSchema` + `setError` con errores del backend | Optimista + error |
| RN-05 nicho | `ErrorToast` + pantalla de contacto | Error |
| RF-05 aseguradora sin cotización | `<WarningToast>` + tarjeta gris "No disponible" | Advertencia |
| RN-03 / RN-04 derivación | `<DerivacionBanner>` + Opción 1 oculta | Informativo |
| RN-07 tope | `max` en input de `NegociarDescuentoForm` | Optimista |
| RN-10 intentos / canal | `RegistrarIntentoForm` deshabilita canal no preferido y botón al llegar al máximo | Optimista |
| RN-11 motivo | `CerrarSeguimientoDialog` con select obligatorio | Optimista |
| 409 caso tomado | `<ErrorToast>` + invalidar cola | Error |
| Pago rechazado | `<EstadoPago>` en rojo + "Intentar de nuevo" | Error |
| PDF en generación | `<WarningToast>` + polling de `GET /polizas/:id/pdf` cada 3 s (máx. 10) | Advertencia |
| ★ RN-30 datos incompletos | `<WarningToast>` + badge en el plan | Advertencia |
| ★ RN-33 ingreso diario | Campo visible solo si `uso ≠ PARTICULAR` | Optimista |
| RN-37 suma fuera de rango | `min`/`max` del `<SumaAseguradaControl>`; si aun así llega 400, `<ErrorToast>` con el rango | Optimista + error |
| RN-37 suma bloqueada (409) | Control deshabilitado + texto "Ya iniciaste tu compra" | Error |
| RN-39 modelo/año sin rango | Tarjeta gris "No disponible" + `<WarningToast>` | Advertencia |
| RN-37 simulación desactualizada | `<SimulacionDesactualizadaBanner>` + `<WarningToast>` | Advertencia |
| ★ RN-42 plan incompleto | `<ErrorToast>` + enlace a `ContenidoPlanPage`; contador "n de 13" bloquea Guardar | Optimista + error |
| ★ RN-43 incoherencia con la Prueba de Choque | Lista de `CONTENIDO_INCOHERENTE` sobre el formulario (se guarda igual) | Advertencia |
| ★ Comparar más de 3 planes | Casilla deshabilitada + "Máximo 3 planes"; 400 `COMPARAR_MAXIMO_3` como respaldo | Optimista + error |
| ★ 409 `CONTENIDO_PLAN_INCOMPLETO` al comprar | `<ErrorToast>` + volver al comparativo | Error |
| RN-38 recargo por cuotas | Línea informativa en `SelectorModoPago` ("recargo de 5 %") con el total que devuelve el backend | Informativo |

---

## 13. Convenciones de código y checklist por feature

- Componentes en PascalCase; hooks `useX`; archivos de API `x.api.ts`.
- Nombres de dominio en español (iguales al backend); nombres técnicos en
  inglés.
- Prohibido `any`; los tipos de `types/api` son la frontera.
- Prohibido calcular dinero en el frontend (solo formatear): ni la prima mensual, ni el recargo de cuotas, ni el efecto de mover la suma asegurada; todo se pide al backend.

**Checklist por feature**
- [ ] Tipos en `shared/types/api/<modulo>.types.ts` copiados del Swagger.
- [ ] Funciones en `api/` + hooks con `query-keys`.
- [ ] Estados loading/empty/error/success.
- [ ] Ruta con `RoleGuard` y entrada en `RoleNavigationConfig`.
- [ ] Mensajes de la tabla 12.2 implementados.
- [ ] Test de componente con MSW (éxito, warning, error).
- [ ] Revisión en 360 px y en modo oscuro (backoffice).
- [ ] `axe` sin violaciones.

---

## 14. Flujo completo de una pantalla (ejemplo: Prueba de Choque)

```
ComparativoPage
  └─ botón coral "Pon a prueba estos planes" → navigate('/cotizacion/:id/prueba')
PruebaChoquePage
  1. useUltimaSimulacion(id)          GET /cotizaciones/:id/prueba-choque
     ├─ existe → muestra resultado (puede "Cambiar mis respuestas"); si `vigente = false`
     │           → <SimulacionDesactualizadaBanner> + "Volver a simular"
     └─ 404    → abre PerfilRiesgoSheet
  2. useEscenarios(uso)               GET /prueba-choque/escenarios?uso=…  (chips de preocupación)
  3. submit perfil → useEjecutarPruebaChoque.mutate(perfil)
                                       POST /cotizaciones/:id/prueba-choque
     Header: X-Cotizacion-Token o Bearer
  4. onSuccess:
     ├─ setQueryData(qk.pruebaChoque.ultima(id), data.simulacion)
     ├─ data.warning → <WarningToast>  (RN-30)
     └─ render: RankingCostoReal · PeorCasoCallout · MatrizEscenarios
               · DiasSinTrabajar (si comercial) · SimulationDisclaimer
  5. CTA por plan:
     ├─ "Comprar este plan" → /compra/:id?prima=<primaCotizadaId>
     └─ "Hablar con un asesor sobre esto" → SolicitarAsesoriaDialog(motivo='DUDA')
  6. onError → <ErrorToast message=error.message />
```

---

## 15. Orden de despliegue (CI/CD)

GitHub Actions por PR: `typecheck` → `lint` → `vitest` → `build` →
Playwright contra preview de Vercel con backend de staging. En `main`:
deploy del frontend (en el proyecto, a **Render**; ver `despliegue-frontend.md`). Variables: `VITE_API_URL`, `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`. `vercel.json` con rewrite de todas las rutas a
`index.html` (SPA) y cabeceras de seguridad (`Content-Security-Policy`
que solo permite `connect-src` a la API y a Supabase).

---

## 16. Instructivo de construcción: configuración inicial y orden por olas

### 16.1 Parte 1 — Configuración inicial (una sola vez)
1. `npm create vite@latest svas-frontend -- --template react-ts`.
2. Tailwind + shadcn/ui (`npx shadcn@latest init`) + tokens de la sección 2.
3. `shared/lib` completo: `supabase.ts`, `api-client.ts`, `query-client.ts`,
   `query-keys.ts`, `format.ts`.
4. `AuthProvider`, `RoleGuard`, `LoginPage`, ambos layouts y el router con
   rutas vacías.
5. Componentes de dominio base: `MoneyValue`, `StatusBadge`, `WarningToast`,
   `ErrorToast`, `RoleGate`, `DemoLegend`.
6. MSW con handlers de `/health` y `/catalogo/campos`.
7. Deploy inicial con la landing (hecho en Render el 2026-11-12; ver `despliegue-frontend.md`).

### 16.2 Parte 2 — Orden por olas (sigue al backend)
- **Ola 0**: login, `UsuariosPage`, páginas de catálogo y parámetros del
  administrador y las páginas de **tarifas** (planes, pesos, rangos,
  completitud y `SimuladorTarifaPage`, que sirve para validar las fórmulas del
  backend antes de construir el embudo).
- **Ola 1**: `CotizarWizard` con formulario dinámico y selectores en cascada
  de vehículo y ubigeo, `ComparativoPage` con `PlanCard` (prima mensual) y
  `SumaAseguradaControl`, `DerivacionBanner`.
- **Ola 2** (en paralelo): ★ `PruebaChoquePage` + páginas admin de reglas; ★ feature `planes` (`DetallePlanDrawer`, comparador) y `ContenidoPlanPage` (necesita las migraciones 0020/0021 del backend);
  `SolicitarAsesoriaDialog`, cola, caso, seguimientos, `RetomaPage`.
- **Ola 3**: `CompraPage` (campos faltantes → firma → pago → cuotas),
  `ConfirmacionPage`, `MisPolizasPage`.
- **Ola 4**: dashboard por rol, reportes (incluye impacto ★), compartir
  resultado de la Prueba de Choque en PDF.

### 16.3 Resumen visual
```
Config inicial ─► Ola 0 admin/catálogo ─► Ola 1 cotizar+comparar
                                               │
                         ┌─────────────────────┴───────────────────┐
                         ▼                                         ▼
                Ola 2 ★ Prueba de Choque                 Ola 2 asesoría/retención
                         └─────────────────────┬───────────────────┘
                                               ▼
                                     Ola 3 compra + pólizas
                                               ▼
                                   Ola 4 dashboard + reportes
```

### 16.4 Checklist por feature
Ver sección 13.

---

## 17. Siguientes pasos recomendados

1. Prueba de usabilidad con 5 usuarios (3 del Segmento A, 2 del B) sobre la
   Prueba de Choque: ¿entienden "Costo Real Anual" sin explicación? Si no,
   renombrar a "Lo que pagarías en un año malo".
2. PWA (manifest + service worker) para instalar y recibir la alerta de
   vencimiento (RF-33).
3. Analítica de embudo (eventos: cotizó, abrió prueba, eligió plan, pagó)
   para alimentar el reporte de impacto.

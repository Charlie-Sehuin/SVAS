# Diseño Visual y UX — SeguroSimple (SVAS)
## Guía de diseño para el frontend del corredor de seguros vehiculares

> **Qué es este documento**: el **cómo se ve y cómo se siente** el frontend.
> Complementa `arquitectura-frontend-seguro-simple.md` (el cómo se construye)
> y `contexto-dominio-seguro-simple.md` (el qué; manda ante cualquier conflicto).
>
> **Qué reemplaza**: las secciones 2 (paleta), 3 (tipografía, espaciado,
> iconografía) y 4 (componentes base) del documento de arquitectura. Todo lo
> demás de ese documento (carpetas, rutas, estado, olas, accesibilidad,
> manejo de errores) sigue vigente. Los **nombres de tokens y de componentes
> de dominio no cambian**; solo cambian sus valores y su apariencia, así que
> el código descrito allí funciona sin tocarse.
>
> **Fuentes de este diseño**: capturas de la web actual de SeguroSimple.com
> (landing, "cómo funciona", siniestros, footer) y el patrón visual de las
> páginas de cotización de Pacífico, Rímac y La Positiva.
>
> **Nota sobre las páginas de aseguradoras**: no pude abrirlas desde mi
> entorno (bloqueo de red), así que de ellas tomo **patrones de estructura**
> (formulario al lado del título, logos de respaldo, pasos numerados) y no
> colores medidos. Los colores de este documento salen de **tus capturas de
> SeguroSimple**, que sí son la marca del corredor. Si quieres afinar la
> comparación con las aseguradoras, usa un cuentagotas de color sobre cada
> página y pega los hex en la sección 3.6.

---

## Índice

1. Diagnóstico: SeguroSimple hoy
2. Dirección de diseño y principios
3. Paleta de colores
4. Tipografía
5. Espaciado, grilla, radios y elevación
6. Iconografía, ilustración y logos
7. Componentes base
8. Componentes de dominio (apariencia)
9. Pantallas del embudo del cliente (wireframes)
10. Pantallas del backoffice (asesor y administrador)
11. Estados, movimiento y microinteracciones
12. Responsividad
13. Accesibilidad visual
14. Voz y tono (copy)
15. Implementación: tokens CSS, Tailwind y shadcn
16. Checklist de diseño por pantalla
17. Decisiones abiertas

---

## 1. Diagnóstico: SeguroSimple hoy

### 1.1 Qué tiene la web actual

| Zona | Lo que hay hoy |
|---|---|
| Header | Logo "seguro simple.com" en carmesí y azul, con la leyenda "con el respaldo de Ategia Corredores de Seguros". Tres botones con borde carmesí: *Te llamamos*, *Contacto ▾*, *Otros Seguros ▾*. Al hacer scroll pasa a una barra azul marino con el logo "S", *Te llamamos*, teléfono y menú hamburguesa, más una esquina carmesí "Cotiza tu seguro vehicular ahora". |
| Hero | Título en mayúsculas ("COTIZA TU SEGURO VEHICULAR"), subtítulo en mayúsculas finas, ilustración promocional ("SOAT GRATIS DE POR VIDA") a la izquierda y **tarjeta blanca con sombra** con el formulario a la derecha. |
| Formulario | Una sola tarjeta, **dos columnas** (Datos del vehículo / Datos del conductor), 10 campos juntos, botón carmesí "Cotiza tu seguro". |
| Confianza | Logos de las 5 aseguradoras en gris, tres beneficios (Compara · Asegura · Ahorra) con icono circular celeste, bloque "Somos el mayor corredor de seguros digital del Perú" con globo turquesa ("ahorres 35 %"), "Más de 300,000 personas han cotizado". |
| Proceso | "¿Cómo funciona?" con 4 pasos y números grandes carmesí. |
| Siniestro | "¿Qué hacer en caso de siniestro?" con 7 iconos de línea azul marino. |
| Footer | Supervisado por la SBS, miembro de APECOSE / Endeavor / Startup Perú, fondo gris oscuro, redes sociales y 4 columnas de enlaces. |

### 1.2 Qué conservamos (es la identidad de marca)

- **Carmesí** como color de acción y de acento de títulos.
- **Azul marino** como color de texto fuerte, encabezados y barra fija.
- **Turquesa** como color de apoyo (el globo del hero). Lo reservamos para el diferenciador (Prueba de Choque).
- **Tarjeta blanca elevada** sobre fondo gris claro como contenedor del formulario.
- Logos de aseguradoras en gris, números grandes en carmesí, iconos de línea.
- Barra superior fija azul marino con el botón "Te llamamos" y el teléfono siempre visibles.

### 1.3 Qué cambiamos y por qué

| Problema en la web actual | Cambio en el nuevo diseño | Razón de negocio |
|---|---|---|
| El flujo termina en "un asesor te llamará" | El flujo termina en **comparar, probar y comprar**; el asesor es la Opción 2, no el único camino | Objetivo 1: cerrar sin asesor (dominio §1) |
| Formulario de 10 campos en una sola pantalla | **Wizard de 3 pasos** (Vehículo · Ubicación · Contacto), un tema por pantalla en móvil | Menos abandono (P6); RNF-07: compra en ≤ 10 min en móvil |
| "Valor de mercado (Mín $0 – Máx $0)" confunde | Se reemplaza por **suma asegurada con rango real** por aseguradora (control con slider) | RN-37; el rango sale del catálogo |
| Año preseleccionado en 2027 | Año **sin valor por defecto** y limitado a 2015–2026 | RN-44: los rangos cargan esos años |
| Títulos en MAYÚSCULAS largas | Títulos en **mayúscula inicial** (más legibles); las mayúsculas quedan solo para sellos y etiquetas cortas | Legibilidad en móvil |
| Ordena por precio (como todos) | Ordena por precio **y** muestra el **Costo Real Anual** con la Prueba de Choque | Diferenciador (dominio §16) |
| Promoción "SOAT gratis" fija en el hero | Pasa a un **slot de promoción** (`<PromoBanner>`) que se enciende o apaga sin tocar código | La promo cambia; el layout no debe |
| Teléfono y "Te llamamos" solo en la barra fija | Se mantienen y se agrega **"Hablar con un asesor"** en cada pantalla del embudo | Opción 2 siempre visible |
| El carmesí de marca se parece al rojo de error | Regla de uso en 3.4: **el rojo de error es otro tono y siempre lleva icono y texto** | Evitar que un error parezca un botón |

---

## 2. Dirección de diseño y principios

**Palabra clave: claro, honesto, cercano.** Un seguro se compra por confianza;
el diseño debe parecerse a un buen asesor: amable, sin letra chica escondida,
sin presionar.

1. **Una decisión por pantalla en móvil.** El cliente típico entra desde el celular (diseño base 360 px).
2. **Dinero siempre visible y legible.** Prima mensual grande, anual secundaria, desembolso con texto y color. Nunca un monto solo en color.
3. **La marca habla en carmesí, el contenido habla en azul marino.** Carmesí = "haz esto" (comprar, cotizar). Azul marino = "lee esto" (títulos, datos).
4. **El diferenciador tiene su propio color.** Turquesa = Prueba de Choque. Si ves turquesa, estás viendo lo que nos distingue.
5. **Transparencia visible.** Leyendas obligatorias (RN-29, RN-46, RNF-20) con estilo discreto pero **no ocultable**.
6. **Familiar para quien ya conoce la web actual.** Mismo carmesí, mismo azul, misma tarjeta blanca: el rediseño se siente como una evolución.
7. **Dos densidades, un solo sistema.** Embudo (aire, tipos grandes, botones de 48 px) y backoffice (compacto, tablas de 44 px, sidebar). Comparten tokens.

---

## 3. Paleta de colores

Todos los colores son **tokens semánticos** (`--color-*`). Ningún componente usa hex directo.

### 3.1 Marca

| Token | Hex (claro) | Uso |
|---|---|---|
| `--color-brand-50` | `#FDE8EF` | Fondo suave de avisos de marca, hover de filas |
| `--color-brand-100` | `#FAC7D8` | Badges suaves, borde del plan recomendado |
| `--color-brand-300` | `#F26B96` | Anillo de foco, bordes activos |
| `--color-brand-500` | `#E6004D` | **Primario**: botón Comprar / Cotizar, números grandes, enlaces de acción. Texto blanco encima: 4.7:1 |
| `--color-brand-600` | `#C20040` | Hover y *pressed* del primario; texto carmesí sobre blanco (6.2:1) |
| `--color-brand-700` | `#9F0036` | Texto sobre `brand-50` (7.1:1) |
| `--color-brand-900` | `#5C0020` | Uso excepcional (modo oscuro, texto muy fuerte) |

### 3.2 Azul marino (texto fuerte, estructura)

| Token | Hex | Uso |
|---|---|---|
| `--color-navy-50` | `#E8F0FA` | Fondo de círculos de iconos (como "Compara / Asegura / Ahorra") |
| `--color-navy-100` | `#C9DAF0` | Bordes suaves, chips |
| `--color-navy-500` | `#1F5AA0` | Enlaces secundarios, foco en backoffice |
| `--color-navy-700` | `#0B3C75` | **Títulos** de sección y de formulario (10.9:1 sobre blanco) |
| `--color-navy-800` | `#14365F` | **Barra superior fija**, footer principal, sidebar del backoffice |
| `--color-navy-900` | `#0F1E33` | Fondo del modo oscuro del backoffice |

### 3.3 Turquesa (diferenciador: Prueba de Choque)

| Token | Hex | Uso |
|---|---|---|
| `--color-accent-50` | `#E3F5F5` | Fondo de la tarjeta de resultado de la Prueba de Choque |
| `--color-accent-500` | `#00A6A6` | Solo decorativo (relleno de barras, globos); **no** para texto (3.0:1) |
| `--color-accent-600` | `#00807F` | **Botón "Pon a prueba estos planes"** y sello "Mejor protección por tu dinero". Texto blanco encima: 4.8:1 |
| `--color-accent-700` | `#006466` | Texto turquesa sobre blanco (7.0:1) o sobre `accent-50` (6.2:1) |

> Cambio respecto del documento de arquitectura: el acento coral `#E8754A`
> desaparece. El diferenciador pasa a turquesa porque ya existe en la
> identidad actual (globo del hero) y se distingue del carmesí de compra.

### 3.4 Reglas de uso del color (importante)

| Regla | Detalle |
|---|---|
| **Un botón carmesí relleno por pantalla** | Es la acción principal ("Cotiza tu seguro", "Comprar este plan", "Pagar"). Todo lo demás es secundario (borde) o terciario (texto). |
| **Carmesí de marca ≠ rojo de error** | El error usa `status-danger` (`#B91C1C`, más oscuro y sin magenta), siempre con **icono + texto** y fondo suave. El carmesí nunca pinta un mensaje de error ni un estado "rechazado". |
| **Turquesa solo para la Prueba de Choque** | Botón de entrada, sello, tarjeta de resultado. No se usa para estados ni decoración general. |
| **Azul marino para títulos y datos** | Nunca para botones primarios. |
| **Color nunca solo** | Todo estado o nivel de desembolso lleva texto ("Pagas USD 150") o icono con texto. |
| **Fondos** | `bg-canvas` gris claro detrás de tarjetas `bg-surface` blancas; el embudo nunca usa fondo oscuro (excepto la barra fija y el footer). |

### 3.5 Neutros, estados y escala de desembolso

**Neutros**

| Token | Claro | Oscuro (backoffice) | Uso |
|---|---|---|---|
| `--color-bg-canvas` | `#F3F4F6` | `#0F1E33` | Fondo general (similar al gris de la web actual) |
| `--color-bg-surface` | `#FFFFFF` | `#14253D` | Tarjetas, tablas, modales |
| `--color-bg-surface-muted` | `#EEF1F5` | `#1B2F4A` | Filas alternadas, campos deshabilitados |
| `--color-border-default` | `#DDE2EA` | `#2B4262` | Bordes de inputs y tarjetas |
| `--color-text-primary` | `#1B2430` | `#E8EEF6` | Texto de lectura (14.2:1 sobre canvas) |
| `--color-text-secondary` | `#5B6676` | `#A8B8CC` | Ayudas, etiquetas secundarias (5.8:1 sobre blanco) |
| `--color-footer-bg` | `#3B3B3F` | `#0A1626` | Footer gris oscuro como el actual |

**Estados** (sin cambios respecto del documento de arquitectura §2.3, con un ajuste de contraste):

| Token | Claro | Oscuro | Mapea a |
|---|---|---|---|
| `--color-status-pending` | `#8A5A00` | `#E3AE4F` | solicitud/pago/cuota PENDIENTE. *Antes `#B7791F` (3.6:1, no pasaba AA); ahora 5.9:1* |
| `--color-status-in-progress` | `#2563EB` | `#6B9BF5` | EN_ATENCION, EN_SEGUIMIENTO |
| `--color-status-success` | `#15803D` | `#4ADE80` | CONVERTIDA, CONFIRMADO |
| `--color-status-danger` | `#B91C1C` | `#F87171` | RECHAZADO, errores |
| `--color-status-neutral` | `#6B7280` | `#9CA3AF` | NO_CONCRETADA, DESCARTADO, CERRADA |
| `--color-status-warning` | `#D97706` | `#FBBF24` | Advertencia no bloqueante (usar con fondo suave y texto oscuro) |
| `--color-status-info` | `#0E7490` | `#22D3EE` | Derivación a asesor, descuento aplicado |

**Escala de desembolso (Prueba de Choque)** — sin cambios (§2.5 del doc de arquitectura):

| Token | Claro | Oscuro | Regla |
|---|---|---|---|
| `--color-out-0` | `#E6F4EA` | `#14271B` | Desembolso = 0 |
| `--color-out-1` | `#FFF4D6` | `#2C2412` | ≤ 10 % del daño |
| `--color-out-2` | `#FFE0C7` | `#33200F` | 10–50 % del daño |
| `--color-out-3` | `#FBD0CC` | `#3A1714` | > 50 % del daño o no cubierto |
| `--color-out-unknown` | rayado diagonal sobre `bg-surface-muted` | ídem | Sin información (RN-30) |

### 3.6 Referencias de aseguradoras (para completar con cuentagotas)

Solo orientativo; **no** se usan en la interfaz salvo en sus logos.

| Aseguradora | Impresión de marca (a verificar) | Hex medido |
|---|---|---|
| Rímac | Rojo corporativo, mucho blanco, fotografía grande | _pendiente_ |
| Pacífico | Azul corporativo con celeste, tono institucional | _pendiente_ |
| La Positiva | Azul corporativo con detalles cálidos | _pendiente_ |
| Mapfre | Rojo oscuro con negro | _pendiente_ |
| Qualitas | Azul oscuro y gris | _pendiente_ |

**Regla práctica**: los logos de aseguradoras se muestran en **escala de grises**
(como hoy) en la franja de confianza, y **a color solo dentro de su propia
tarjeta de plan**, a 24 px de alto, para que el cliente reconozca la marca sin
que el carmesí de SeguroSimple compita con el rojo de Rímac.

---

## 4. Tipografía

### 4.1 Familias

| Rol | Familia | Por qué |
|---|---|---|
| Títulos y cuerpo | **Lato** (400, 700, 900) | Es la familia visible en la web actual; mantiene continuidad de marca |
| Montos y tablas | **Inter** con `font-feature-settings: 'tnum'` | Cifras tabulares para que las columnas de dinero alineen |
| Número de póliza y referencias | **JetBrains Mono** | Distingue ceros y letras |

Carga con `font-display: swap`; en producción alojar los archivos propios (sin Google Fonts) para no depender de un tercero.

### 4.2 Escala

| Estilo | Móvil | Escritorio | Peso | Uso |
|---|---|---|---|---|
| `display` | 32/38 | 48/54 | 900 | Hero de la landing |
| `h1` | 26/32 | 34/40 | 700 | Título de pantalla |
| `h2` | 20/28 | 26/34 | 700 | Título de sección, **color `navy-700`** |
| `h3` | 17/24 | 20/28 | 700 | Título de tarjeta |
| `body` | **16/24** | 16/26 | 400 | Texto general. **Nunca menos de 16 px en inputs** (evita el zoom de iOS) |
| `small` | 14/20 | 14/20 | 400 | Ayudas, leyendas |
| `caption` | 12/16 | 12/16 | 700, mayúsculas, +4 % espaciado | Sellos y etiquetas cortas |
| `money-xl` | 32/36 | 40/44 | 700 Inter tnum | Prima mensual en `PlanCard` |
| `money-md` | 20/24 | 22/28 | 600 Inter tnum | Prima anual, desembolso |
| `step-number` | 56/56 | 72/72 | 900 | Numerales de "¿Cómo funciona?" en `brand-500` |

### 4.3 Reglas

- Títulos en **mayúscula inicial**, no en MAYÚSCULAS completas. Excepción: sellos (`caption`).
- Máximo **70 caracteres por línea** en texto largo.
- Subrayado solo en enlaces; el azul `navy-500` en enlaces de texto y carmesí `brand-600` en enlaces de acción.
- Backoffice: `body` 14/20, `h1` 20/28, tablas 14/20.

---

## 5. Espaciado, grilla, radios y elevación

**Base de 4 px.** Escala: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64.

| Elemento | Móvil | Escritorio |
|---|---|---|
| Padding lateral de página | 16 | 24 (contenedor máx. 1200) |
| Separación entre bloques | 24 | 48 |
| Padding interno de tarjeta | 16 | 24 |
| Alto de botón principal | **48**, ancho completo | 48, ancho auto (mín. 200) |
| Alto de input | 48 | 44 |
| Fila de tabla (backoffice) | — | 44 |
| Objetivo táctil mínimo | 44 × 44 | 44 × 44 |

**Radios**: botones `rounded-lg` (8 px) · inputs `rounded-lg` (8) · tarjetas de plan `rounded-xl` (12) · tarjeta del formulario `rounded-2xl` (16) · chips y badges `rounded-full`.

**Elevación** (la tarjeta blanca elevada es parte de la identidad):

| Nivel | Sombra | Dónde |
|---|---|---|
| 0 | ninguna, borde `border-default` | Tarjetas de plan sin seleccionar, tablas |
| 1 | `0 2px 8px rgb(15 30 51 / 0.08)` | Tarjeta del formulario del hero, plan seleccionado |
| 2 | `0 8px 24px rgb(15 30 51 / 0.14)` | Modales, drawer, barra de comparar |

**Breakpoints**: `base` 360 · `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280.

---

## 6. Iconografía, ilustración y logos

- **Iconos**: `lucide-react`, trazo 1.75 px, color `navy-700` por defecto (como los iconos de línea de "qué hacer en caso de siniestro"). Tabla de equivalencias del doc de arquitectura §3.3 sigue vigente.
- **Círculos de icono**: círculo de 56 px con fondo `navy-50` e icono de 28 px (patrón de Compara · Asegura · Ahorra).
- **Ilustración**: estilo plano con las mismas paletas (carmesí, azul, turquesa). Un auto, una familia, un escudo. **Evitar fotografías de stock genéricas** en el embudo; la foto del volante se puede mantener solo en el bloque "Somos el mayor corredor".
- **Logo**: versión completa (carmesí + azul + leyenda del respaldo) en el header del embudo; versión "S" cuadrada carmesí en la barra fija y en el favicon. Área de respeto = alto de la "S" alrededor.
- **Logos de aseguradoras**: SVG, escala de grises en la franja; color en la tarjeta de plan.
- **Ilustración de estados vacíos**: máximo 120 px de alto, una línea de texto y una acción.

---

## 7. Componentes base

Se construyen sobre shadcn/ui (Radix) con los tokens de la sección 3.

### 7.1 Button

| Variante | Apariencia | Uso |
|---|---|---|
| `primary` | Relleno `brand-500`, texto blanco, hover `brand-600` | Acción principal única por pantalla |
| `accent` | Relleno `accent-600`, texto blanco | **Solo** "Pon a prueba estos planes" |
| `secondary` | Fondo blanco, borde 1.5 px `brand-500`, texto `brand-600` (igual que los botones del header actual) | "Hablar con un asesor", "Te llamamos" |
| `outline-navy` | Borde `navy-700`, texto `navy-700` | Acciones neutras ("Ver detalle", "Volver") |
| `ghost` | Sin borde, texto `navy-500` | Enlaces en línea |
| `destructive` | Relleno `status-danger` | Solo backoffice (desactivar, eliminar) |

Estados: *hover* oscurece un paso; *focus-visible* anillo 3 px `brand-300` con separación 2 px; *disabled* 40 % de opacidad **y** cursor `not-allowed`; *loading* spinner a la izquierda y texto "Procesando…", el botón no cambia de ancho.

### 7.2 Campos de formulario

- **Etiqueta arriba**, 14 px, peso 700, color `navy-700` (como "Marca", "Año" en el formulario actual). Nunca placeholder como etiqueta.
- Input con fondo blanco, borde `border-default`, `rounded-lg`, alto 48. En foco: borde `brand-500` + anillo `brand-300`.
- **Ayuda** bajo el campo, 14 px, `text-secondary`. Ejemplo: "6 caracteres, sin guion".
- **Error** bajo el campo: icono + texto en `status-danger`, borde `status-danger`. Mensaje en lenguaje llano.
- Selectores en cascada (marca → modelo → año): al elegir marca, los siguientes se deshabilitan hasta tener opciones y muestran esqueleto de carga.
- Campo de documento: select de tipo (DNI / CE) pegado al input, como hoy.
- Celular: prefijo `+51` fijo y teclado numérico (`inputmode="numeric"`).
- Interruptor "No tengo placa": el campo de placa se deshabilita y se enfría visualmente.

### 7.3 Card

Fondo `bg-surface`, borde `border-default`, `rounded-xl`, sombra nivel 0. La **tarjeta del formulario del hero** es `rounded-2xl` con sombra nivel 1 (como hoy).

### 7.4 Badge y StatusBadge

Píldora de 24 px de alto, fondo suave del color de estado (12 % de opacidad), texto en el color pleno y un **punto o icono** a la izquierda. Texto siempre presente.

### 7.5 Stepper del embudo

Tres pasos: **Cotizar · Comparar · Comprar**. En móvil, una barra de progreso de 4 px bajo el header y el texto "Paso 2 de 3 · Comparar". En escritorio, tres círculos numerados unidos por una línea; el paso activo en `brand-500`, los completados con ✓ en `navy-700`.

### 7.6 Header y barra fija

| Contexto | Apariencia |
|---|---|
| Landing (arriba del todo) | Fondo blanco transparente, logo completo a la izquierda; a la derecha botones `secondary`: *Te llamamos*, *Contacto ▾*, *Otros seguros ▾* |
| Después de hacer scroll (todas las pantallas del embudo) | **Barra fija `navy-800`** de 64 px: esquina carmesí con "Cotiza tu seguro vehicular ahora" a la izquierda (solo en landing), "S" centrada, `Te llamamos` (`primary`, tamaño pequeño), teléfono `(01) 680-3770` y menú |
| Pantallas de embudo (cotizar, comparar, comprar) | Barra `navy-800` compacta: logo "S", stepper, botón "Hablar con un asesor" siempre visible |

### 7.7 Footer

Fondo `footer-bg`, tres franjas: (1) Supervisado por la SBS + "Miembro de" con logos en gris, sobre `bg-canvas`; (2) redes sociales como círculos oscuros con icono blanco; (3) cuatro columnas de enlaces con títulos en carmesí claro (`#FF4D82` sobre `#3B3B3F`) y enlaces blancos. Incluye el **Libro de reclamaciones** y la leyenda "Documento de demostración sin validez legal" (RNF-20) mientras el sistema esté en modo demostración.

### 7.8 Modales, drawer y toasts

- **Dialog**: centrado en escritorio, **pantalla completa inferior (Sheet)** en móvil, esquinas superiores `rounded-2xl`, sombra nivel 2.
- **Toasts** (sonner) arriba a la derecha en escritorio, abajo en móvil. Icono + texto; `WarningToast` ámbar, `ErrorToast` rojo `status-danger`, éxito verde. Duración 6 s (los de error no se cierran solos).

---

## 8. Componentes de dominio (apariencia)

Los nombres y la lógica son los de la arquitectura §4.2; aquí se define **cómo se ven**.

### 8.1 `<MoneyValue>`

Inter tabular, símbolo de moneda en peso 400 y 70 % del tamaño, cifra en peso 700. Ejemplos:

```
USD 53.37 / mes        →  "USD" pequeño · "53.37" grande · "/ mes" pequeño y gris
USD 640.40 al año      →  money-md, text-secondary
```

Para lectores de pantalla: `aria-label="53 dólares con 37 centavos al mes"`.

### 8.2 `<PlanCard>`

```
┌──────────────────────────────────────────────────────┐
│ [logo aseguradora a color 24px]            ⭐ Recomendado│  ← sello solo si aplica
│ Plan Oro                                              │  h3 navy-700
│ "Cobertura ampliada con lunas, autopartes y asistencia"│  small, text-secondary
│                                                        │
│   USD 53.37 / mes                                      │  money-xl, navy-700
│   USD 640.40 al año · Suma asegurada USD 15,000        │  money-md, text-secondary
│                                                        │
│   ✓ Daño por choque  ✓ Robo total                      │  4 coberturas incluidas
│   ✓ Responsabilidad civil  ✓ Auxilio mecánico          │
│                                                        │
│  [ Ver detalle ]   ☐ Comparar                          │  outline-navy + checkbox
│  [        Comprar este plan        ]  ← primary         │
│  [ Hablar con un asesor ] ← secondary (solo si opciones)│
└──────────────────────────────────────────────────────┘
```

- **Plan recomendado** (primero del ranking de Costo Real, si la simulación existe): borde 2 px `brand-100`, fondo `brand-50` muy sutil y sello turquesa "Mejor protección por tu dinero".
- **Plan seleccionado**: sombra nivel 1 y borde `navy-700`.
- **No disponible** (`disponible = false`): fondo `bg-surface-muted`, texto gris, sin botones, con el texto de `motivoNoDisponible` ("Qualitas no cotiza este vehículo").
- **Información incompleta** (RN-30): badge ámbar y texto "Información incompleta", nunca lleva sello de mejor.

### 8.3 `<SumaAseguradaControl>`

```
Rímac · Suma asegurada
 USD 12,000 ├──────────●──────────┤ USD 16,800        [ USD 15,000 ]
                                                      rango permitido
```

- Slider con pista `navy-100` y tramo activo `navy-700`; asa de 28 px con borde blanco.
- Valor en input numérico a la derecha (mismo valor; se sincronizan).
- Mientras llega la respuesta del backend: el monto de la prima se reemplaza por **esqueleto** de la misma forma. **Nunca** se muestra un monto calculado en el navegador.
- Deshabilitado (409): slider gris y texto "Ya iniciaste tu compra".

### 8.4 `<DetallePlanDrawer>`

Móvil: pantalla completa desde abajo. Escritorio: panel lateral de 480 px. Cabecera con logo, nombre del plan y botón cerrar. Tres pestañas con indicador carmesí: **Qué cubre · Qué no cubre · Requisitos**. Al pie, fija: `<ContenidoLeyenda>`.

### 8.5 `<CoberturaItem>`

Fila de 48 px: icono en círculo (✓ verde sobre `out-0`, ✗ gris sobre `bg-surface-muted`) **+ texto** "Incluida" / "No incluida" a la derecha, nombre a la izquierda, `detalle` ("Hasta USD 100,000") debajo en `small`.

### 8.6 `<MatrizCoberturas>`

Tabla cobertura × plan (máx. 3). Encabezado fijo con logo y nombre del plan; primera columna fija en móvil; celdas con ✓ / ✗ más texto accesible para lector de pantalla. Fila resaltada con fondo `brand-50` al pasar el cursor.

### 8.7 Prueba de Choque (componentes ★)

| Componente | Apariencia |
|---|---|
| Botón de entrada | `accent` (turquesa), icono `ShieldAlert`, texto "Pon a prueba estos planes", debajo en pequeño: "Mira cuánto pagarías tú si te pasa algo" |
| `<RankingCostoReal>` | Lista ordenada con posición grande (1, 2, 3) en `navy-700` y barra apilada por plan |
| `<CostoRealBar>` | Barra horizontal: tramo `navy-700` = prima, tramo `accent-500` = desembolso esperado; etiquetas con montos al final de cada tramo |
| `<OutOfPocketCell>` | Celda con fondo de la escala `out-0…3`, monto grande ("Pagas USD 150") y texto debajo del nivel ("bajo", "medio", "alto") |
| `<ScenarioCard>` | Tarjeta con icono del escenario (`Car`, `Wrench`, `KeyRound`, `Users`, `Ban`), nombre en lenguaje llano y una fila por plan con su `OutOfPocketCell` |
| `<PeorCasoCallout>` | Caja `accent-50` con borde izquierdo 4 px `accent-600`: "Tu peor caso del año con este plan: USD 3,500" |
| `<SimulationDisclaimer>` | `small`, `text-secondary`, icono de información, no ocultable |

### 8.8 Otros componentes de dominio

| Componente | Apariencia |
|---|---|
| `<DerivacionBanner>` | Banda `status-info` suave con icono `Headset` y texto: "Este uso requiere una inspección. Un asesor te contactará por {canal}." |
| `<SimulacionDesactualizadaBanner>` | Banda ámbar con botón `outline-navy` "Volver a simular" |
| `<AttemptCounter>` | Texto + 4 puntos (llenos = intentos usados) |
| `<ContactChannelPicker>` | Dos tarjetas-radio grandes (Llamada / WhatsApp) con icono; la elegida con borde `brand-500` |
| `<DemoLegend>` | Franja `bg-surface-muted` de 32 px, `caption` |
| `<PromoBanner>` (nuevo) | Slot de promoción configurable (p. ej. SOAT gratis): imagen o texto + botón; se oculta si no hay promo vigente |
| `<TrustStrip>` (nuevo) | Franja de logos de aseguradoras en escala de grises + SBS |

---

## 9. Pantallas del embudo del cliente (wireframes)

Cada pantalla se muestra primero en **móvil 360 px** (diseño de referencia) y luego se describe el cambio en escritorio.

### 9.1 Landing `/`

**Escritorio (≥ 1024 px)**

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [logo seguro simple.com]            [Te llamamos] [Contacto ▾] [Otros ▾]    │
├──────────────────────────────────────────────────────────────────────────┤
│ Cotiza tu seguro vehicular             ┌───────────────────────────────┐  │
│ Compara las 5 aseguradoras en          │ Cotiza al instante             │  │
│ segundos y mira cuánto pagarías        │ ● Vehículo ○ Ubicación ○ Contacto│  │
│ de verdad si te pasa algo.             │                                │  │
│                                        │ Marca          [ Selecciona ▾ ]│  │
│ [ <PromoBanner> SOAT gratis …  ]       │ Modelo         [ Selecciona ▾ ]│  │
│                                        │ Año            [ Selecciona ▾ ]│  │
│  ✓ 5 aseguradoras  ✓ Sin llamadas      │                                │  │
│  ✓ Compra en línea                     │ [        Continuar        ]    │  │
│                                        └───────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────────┤
│  [pacífico] [MAPFRE] [RIMAC] [Qualitas] [La Positiva]   ← <TrustStrip>     │
├──────────────────────────────────────────────────────────────────────────┤
│  (◯)Compara          (◯)Prueba            (◯)Asegura           (◯)Ahorra    │
├──────────────────────────────────────────────────────────────────────────┤
│  ¿Cómo funciona SeguroSimple?   1 Cotiza · 2 Prueba · 3 Elige · 4 Paga     │
├──────────────────────────────────────────────────────────────────────────┤
│  Somos el mayor corredor de seguros digital del Perú  [globo turquesa]      │
├──────────────────────────────────────────────────────────────────────────┤
│  ¿Qué hacer en caso de siniestro?  (7 pasos con iconos)                     │
├──────────────────────────────────────────────────────────────────────────┤
│  Más de 300,000 personas han cotizado · reconocimientos                     │
├──────────────────────────────────────────────────────────────────────────┤
│  Supervisado por SBS · Miembro de …   ·   Footer                            │
└──────────────────────────────────────────────────────────────────────────┘
```

**Móvil**: logo + menú hamburguesa; título `display` de 32 px; la tarjeta del formulario ocupa el ancho completo justo bajo el título (el `PromoBanner` baja debajo de la tarjeta); los 4 beneficios y los pasos se apilan en una columna.

Cambios clave frente a hoy:
- El formulario del hero muestra **solo el paso 1** (Vehículo) y continúa en `/cotizar`, no 10 campos juntos.
- "Cómo funciona" pasa de *Cotiza → Un asesor te llamará → Elige → Paga* a **Cotiza → Prueba de Choque → Elige → Paga** (el asesor queda como opción, no como paso obligatorio).
- La sección de siniestros se mantiene tal cual (aporta confianza), con los iconos en `navy-700`.

### 9.2 Cotizar `/cotizar` (wizard de 3 pasos)

```
┌─ Barra navy-800: [S]  Cotizar ● ─ Comparar ○ ─ Comprar ○   [Hablar con asesor]┐
│ Paso 1 de 3 · Tu vehículo                                                │
│ ▓▓▓▓▓▓░░░░░░░░░░░░                                                        │
│                                                                           │
│ ¿Qué auto quieres asegurar?                       (h1)                    │
│                                                                           │
│ Marca        [ Toyota           ▾ ]                                       │
│ Modelo       [ Corolla          ▾ ]                                       │
│ Año          [ 2022             ▾ ]                                       │
│ Uso          [ Particular       ▾ ]                                       │
│ Placa        [ ABC123 ]   ○ No tengo placa                               │
│                                                                           │
├──────────────────────────────────────────────────────────────────────────┤
│  [          Continuar          ]   ← primary, fijo abajo en móvil         │
└──────────────────────────────────────────────────────────────────────────┘
```

| Paso | Campos | Notas |
|---|---|---|
| 1 · Vehículo | Marca → Modelo → Año (en cascada), Uso, Placa (o "No tengo placa") | El **tipo** no se pregunta |
| 2 · Ubicación | Departamento → Provincia → Distrito (en cascada) | Ayuda: "La zona influye en el precio y en la Prueba de Choque" |
| 3 · Contacto | Documento (tipo + número), Celular, Correo, `<ContactChannelPicker>` (Llamada / WhatsApp), casilla de términos y política de privacidad | El botón final dice **"Ver mis cotizaciones"** (no "Cotiza tu seguro") |

Escritorio: columna central de 640 px + **resumen lateral** a la derecha con lo ya elegido ("Toyota Corolla 2022 · Particular · Miraflores") y un recuadro "¿Necesitas ayuda? Te llamamos".

Reglas visuales:
- Los campos de otros pasos **no se muestran**. El botón "Atrás" es `ghost` a la izquierda del primario.
- El borrador se guarda (sessionStorage); si el cliente vuelve, ve lo escrito.
- Validación al salir del campo, mensaje debajo en lenguaje llano ("Pacífico necesita el distrito para cotizarte").

### 9.3 Comparativo `/cotizacion/:id`

```
┌─ Barra: [S] Cotizar ✓ ─ Comparar ● ─ Comprar ○        [Hablar con asesor]┐
│ Toyota Corolla 2022 · Miraflores                          [Editar datos]  │
│                                                                           │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ ⛨ ¿Y si te pasa algo?   [ Pon a prueba estos planes ]  ← accent turquesa│ │
│ │ Mira cuánto pagarías tú en 6 situaciones reales.                       │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│ Ordenar por: ( ) Precio mensual  ( ) Costo real anual*   Filtro [Aseg. ▾]  │
│                                                                           │
│ Rímac · Suma asegurada  USD 12,000 ├────●────┤ USD 16,800   [15,000]      │
│ ┌─────────────────────┐  ┌─────────────────────┐                          │
│ │ Plan Plata  <PlanCard>│  │ Plan Oro  <PlanCard>  │                          │
│ └─────────────────────┘  └─────────────────────┘                          │
│                                                                           │
│ Pacífico · Suma asegurada …                                               │
│ ┌──────────┐ ┌──────────┐                                                 │
│ …                                                                         │
├──────────────────────────────────────────────────────────────────────────┤
│ Comparar (2 de 3)  [Rímac Oro] [Pacífico Premium]  [ Comparar planes ]    │ ← barra fija inferior
└──────────────────────────────────────────────────────────────────────────┘
```

*La opción "Costo real anual" aparece activa solo si ya existe una simulación vigente.*

- **Móvil**: tarjetas apiladas; el filtro por aseguradora abre un `Sheet`; la barra "Comparar" fija abajo reemplaza al botón de ayuda flotante.
- **Escritorio**: bloque por aseguradora, con sus 2 planes en 2 columnas; el comparativo completo usa grid de 3 columnas en pantallas ≥ 1280 px.
- Si hay `DerivacionBanner` (inspección o no asegurable): se muestra arriba y desaparece el botón **Comprar**; queda solo "Hablar con un asesor".
- Si una aseguradora no cotiza: su tarjeta va en gris, al final del bloque, con `<WarningToast>` informando una sola vez.

### 9.4 Detalle del plan y comparar planes

- **Detalle**: `DetallePlanDrawer` (8.4). En móvil ocupa la pantalla completa; en escritorio, panel lateral de 480 px. Pestañas con subrayado carmesí de 3 px.
- **Comparar** `/comparar?ids=…`: `MatrizCoberturas` bajo una cabecera con las 3 tarjetas resumidas (logo, plan, prima mensual). Fila "Total que cubre: 13 de 13". Botón compartir (copia el enlace). Leyenda de contenido ilustrativo al pie.

### 9.5 Prueba de Choque `/cotizacion/:id/prueba`

```
┌─ Barra …                                                                 ┐
│ ⛨ Si este año te pasa algo, ¿cuánto pagarías tú?       (h1)              │
│                                                                           │
│ ┌ Resultado (fondo accent-50) ─────────────────────────────────────────┐ │
│ │ 1  Pacífico Premium   ▓▓▓▓▓▓▓▓░░░░  USD 680 al año  ⭐ Mejor protección │ │
│ │ 2  Rímac Oro          ▓▓▓▓▓▓▓▓▓░░░  USD 735 al año                    │ │
│ │ 3  Mapfre Total       ▓▓▓▓▓▓▓▓▓▓░░  USD 790 al año                    │ │
│ │    ▓ prima   ░ lo que pagarías tú en un año malo                       │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│ Escenarios                              (matriz en escritorio, carrusel en móvil)
│ ┌────────────┬──────────┬──────────┬──────────┐                          │
│ │            │ P Premium │ R Oro    │ M Total  │                          │
│ │ 🚗 Choque leve │ Pagas 150 │ Pagas 180│ Pagas 200│  ← celdas con color out-N │
│ │ 🔧 Choque fuerte│ …        │          │          │                          │
│ │ 🔑 Robo total  │ …        │          │          │                          │
│ └────────────┴──────────┴──────────┴──────────┘                          │
│                                                                           │
│ [Peor caso del año: USD 3,500 con Rímac Oro]  ← PeorCasoCallout           │
│ (solo comercial) Días sin trabajar: 12 · Costo estimado USD 600            │
│                                                                           │
│ [ Comprar este plan ] primary    [ Hablar con un asesor sobre esto ]       │
│ [ Descargar resumen en PDF ]                                              │
│ Estimación referencial basada en condiciones resumidas. Prevalece el      │
│ condicionado de la aseguradora.                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Primera vez**: `PerfilRiesgoSheet` abre desde abajo con 3 interruptores grandes (cochera, muchos km, uso nocturno) y, si el uso es comercial, el campo "¿Cuánto ganas al día? (S/)". Al final, chips "¿Qué te preocupa más?".
- **Móvil**: el ranking va primero; los escenarios se muestran como **un carrusel de tarjetas** (un escenario por tarjeta, planes como filas) con puntos indicadores.
- **Resultado desactualizado**: banda ámbar arriba + contenido atenuado al 60 %.
- Lenguaje de las celdas: "**Pagas USD 150**", nunca solo el número en color.

### 9.6 Compra `/compra/:cotizacionId`

Wizard de 4 pasos con el mismo patrón visual del paso a paso de la cotización:

| Paso | Contenido visual |
|---|---|
| 1 · Resumen | Tarjeta con el plan, suma asegurada, prima y "Contenido del plan" desplegable. Línea informativa verde: "Se aplicó tu 5 % de descuento por primera compra". Si no hay registro, `RegistroMinimoDialog` aparece aquí, sin sacar al cliente del embudo |
| 2 · Datos faltantes | Solo los campos que no se pidieron antes (RNF-08) |
| 3 · Firma y condiciones | Casilla de aceptación, firma simulada (cuadro de dibujo táctil o escribir nombre), enlace a condiciones |
| 4 · Pago | `SelectorModoPago`: dos tarjetas-radio (**Pago único** / **12 cuotas**) con el total y la cuota que devuelve el backend; línea informativa del recargo si aplica ("Pagar en cuotas tiene un recargo de 5 % en La Positiva"). Botón primario "Pagar USD …" fijo abajo |

- **Barra de resumen fija** (escritorio, lateral): plan, prima final y descuento.
- `<EstadoPago>`: pendiente (spinner + "Procesando tu pago…"), confirmado (círculo verde con ✓ y texto), rechazado (banda roja `status-danger` con icono, texto "Tu pago no pudo procesarse" y botón "Intentar con otro medio").

### 9.7 Confirmación `/compra/:id/listo`

Pantalla de celebración sobria: círculo verde con ✓, título "¡Listo! Tu seguro está activo", datos de la póliza (número en `JetBrains Mono`), botón primario **"Descargar mi póliza (PDF)"**, secundario "Ver cronograma de cuotas". Texto: "Este es el contenido del plan que contrataste el {fecha}" (RN-45) y la leyenda de demostración (RNF-20). Si el PDF está en generación: toast ámbar y botón con spinner.

### 9.8 Retoma `/retoma/:token`

Pantalla simple con el resumen de la cotización guardada, el descuento aplicado en banda `status-info` y botón primario "Continuar mi compra". Si el enlace venció: ilustración pequeña, "Este enlace venció. Puedes cotizar de nuevo en 1 minuto." y botón primario "Cotizar ahora".

### 9.9 Mi cuenta `/mi-cuenta/*`

Menú de cuenta en el header (avatar con iniciales). Pestañas **Mis cotizaciones · Mis pólizas**. Cada elemento es una tarjeta con `StatusBadge` y una acción única (Ver, Continuar, Descargar).

---

## 10. Pantallas del backoffice (asesor y administrador)

### 10.1 Layout

```
┌────────────┬─────────────────────────────────────────────────────────────┐
│ [S] SVAS   │ Topbar: buscar cotización o documento…        [👤 Ana ▾] [🌙] │
│            ├─────────────────────────────────────────────────────────────┤
│ 📊 Dashboard│ Título de la pantalla (h1 20/28)       [Acción principal]   │
│ ─────────  │                                                              │
│ 🎧 Atención │ ┌ Filtros ─────────────────────────────────────────────┐   │
│  Cola       │ └──────────────────────────────────────────────────────┘   │
│  Seguimiento│ ┌ Tabla densa (filas de 44 px) ────────────────────────┐   │
│ …           │ │ …                                                     │   │
│ (sidebar    │ └──────────────────────────────────────────────────────┘   │
│  navy-800)  │                                                              │
└────────────┴─────────────────────────────────────────────────────────────┘
```

- **Sidebar** 240 px, fondo `navy-800`, texto blanco 80 %; ítem activo con barra izquierda carmesí de 3 px y texto blanco 100 %. Colapsable a 64 px (solo iconos con tooltip).
- Grupos con título en `caption` (mayúsculas) en `navy-300`; un grupo sin ítems visibles para el rol **no se renderiza** (oculto, no deshabilitado).
- **Modo oscuro** disponible solo en backoffice (`navy-900` como canvas).
- El botón principal de cada pantalla usa `primary`; las acciones destructivas usan `destructive` con confirmación.

### 10.2 Dashboard

Fila de 4 tarjetas KPI (valor grande `money-xl`/`h1`, etiqueta y variación con flecha **y** texto) y debajo dos tarjetas: gráfico y lista. El asesor ve **su cola**; el administrador ve ventas por canal. Los gráficos usan la paleta `navy` (serie principal), `brand-500` (conversión), `accent-600` (Prueba de Choque) y neutros; nunca los colores de estado como serie.

### 10.3 Cola de asesoría y caso

- **Cola**: tabla con orden RN-13; columnas: prioridad (icono + texto "Sistema" / "Cliente"), motivo, canal, tiempo de espera (en ámbar si supera 4 h), `StatusBadge`, botón "Tomar caso".
- **Caso**: dos columnas. Izquierda: datos del cliente (documento enmascarado), vehículo, `SimulacionDelCaso` ★ (resumen de Prueba de Choque). Derecha: `NegociarDescuentoForm` con `max` visible ("Máximo permitido: 10 %"), historial y botones de cierre. El botón "Tomar caso" y los errores 409 usan toast rojo "Otro asesor tomó este caso".

### 10.4 Seguimientos

Lista con `<AttemptCounter>` ("Intento 2 de 4 · quedan 5 días"). Formulario de intento con **solo el canal preferido habilitado** y el otro en gris con tooltip. Cierre con select de motivo obligatorio.

### 10.5 Administración (catálogo, tarifas, contenido, Prueba de Choque)

- **Tablas editables** con edición en línea (celda a celda), carga CSV y validación visible en la celda (borde rojo + mensaje debajo). Rango de pesos 0,500–3,000 con ayuda "menor que 1 = descuento".
- **`ContenidoPlanPage`**: formulario de 4 pestañas (Descripción · Coberturas · Exclusiones · Requisitos). Cabecera fija con contador **"11 de 13 coberturas definidas"** y botón **Guardar** deshabilitado hasta completar. Advertencias `CONTENIDO_INCOHERENTE` en una lista ámbar sobre el formulario, con el nombre de la cobertura.
- **`SimuladorTarifaPage`**: formulario (modelo, año, ubigeo, suma) y debajo una tabla de las 10 primas con filas desplegables que muestran `<DesgloseCalculo>` (tabla "tasa base × pesos = tasa → prima").
- **Completitud** (tarifas y contenido): tabla con semáforo **con texto** ("Completo", "Faltan 2", "Incoherente").
- **Bitácora**: tabla de solo lectura con filtro por entidad y detalle "antes / después" en dos columnas.

### 10.6 Reportes

Filtros arriba (periodo, canal, aseguradora), tarjetas KPI, gráfico y tabla exportable. Cada gráfico lleva título que dice la conclusión ("Las ventas por asesoría crecieron 12 %"), no solo el nombre de la métrica.

---

## 11. Estados, movimiento y microinteracciones

### 11.1 Estados obligatorios

| Estado | Apariencia |
|---|---|
| `loading` | **Esqueleto con la forma final** (tarjetas, filas, montos); sin spinner genérico a pantalla completa |
| `empty` | Ilustración pequeña + una línea + una acción ("Aún no tienes cotizaciones · Cotizar ahora") |
| `error` | `ErrorToast` + bloque en la pantalla con botón "Reintentar"; mensaje del backend tal cual, con el `correlationId` copiable en el detalle |
| `success` | Contenido normal; confirmaciones con toast verde breve |
| `waking` | Si la primera petición tarda más de 4 s: banda `status-info` "Estamos despertando el servidor, puede tardar unos segundos" |

### 11.2 Movimiento

- Transiciones de **150–200 ms**, curva `ease-out`. Drawer y sheets desde abajo/lado en 250 ms.
- Respetar `prefers-reduced-motion`: se desactivan deslizamientos y animación de barras; quedan cambios de opacidad.
- Barras de `CostoRealBar` se llenan una sola vez al cargar (400 ms).
- Al cambiar la suma asegurada: el monto hace un fundido breve al recibir el valor del backend (sin contar de 0 a N: el número no se "calcula" visualmente).
- Sin parpadeos, sin carruseles automáticos, sin ventanas emergentes de salida.

### 11.3 Microinteracciones útiles

- Al marcar "Comparar" en una tarjeta, la barra inferior sube con el nombre del plan.
- Al completar un paso del wizard, la barra de progreso avanza y el foco pasa al título del paso siguiente.
- Botón de copiar enlace de comparación: el icono cambia a ✓ por 2 s.
- En el control de suma, al llegar al mínimo o máximo, vibración corta (si el dispositivo lo permite) y el borde del rango se resalta.

---

## 12. Responsividad

| Pantalla | Móvil (360) | Tablet (768) | Escritorio (≥ 1024) |
|---|---|---|---|
| Landing | Una columna; formulario bajo el título | Hero en dos columnas apretadas | Hero con formulario a la derecha |
| Cotizar | Un paso por pantalla, CTA fijo abajo | Columna central 560 px | Columna 640 px + resumen lateral |
| Comparativo | Tarjetas apiladas, filtro en Sheet | 2 columnas | Bloque por aseguradora con 2–3 columnas |
| Detalle de plan | Pantalla completa | Panel lateral 420 px | Panel lateral 480 px |
| Comparar planes | Primera columna fija + scroll horizontal | Matriz completa | Matriz completa |
| Prueba de Choque | Ranking + carrusel de escenarios | Ranking + matriz | Ranking + matriz completa |
| Compra | Un paso por pantalla, botón fijo | Columna 560 px | Columna 640 px + resumen fijo |
| Backoffice | Funcional, no prioritario | Sidebar colapsado | Sidebar fijo, tablas densas |

Reglas: sin scroll horizontal de página (solo en tablas y matriz); CTA principal con `sticky bottom-0` en móvil, con espacio inferior para no tapar contenido; probar en 360×740 con CPU 4× más lenta (meta del doc de arquitectura §10.3).

---

## 13. Accesibilidad visual

Cumple lo definido en la arquitectura §11 y añade:

| Aspecto | Regla |
|---|---|
| Contraste | Texto normal ≥ 4.5:1, texto grande y componentes ≥ 3:1. Verificado para los pares principales de esta guía (ver 3.1–3.5) |
| Pares que **no** se deben usar | Blanco sobre `accent-500` (3.0:1), `status-pending` claro `#B7791F` como texto (3.6:1), texto carmesí `brand-500` sobre `brand-50` (usar `brand-700`) |
| Foco | Anillo visible de 3 px `brand-300` con separación 2 px; en barra `navy-800` el anillo es blanco |
| Color solo | Prohibido: toda diferencia lleva texto o icono |
| Tamaño | Texto base 16 px; permitir zoom al 200 % sin perder contenido |
| Objetivo táctil | ≥ 44 × 44 px |
| Montos | `aria-label` con el monto en palabras ("53 dólares con 37 centavos") |
| Estados dinámicos | `aria-live="polite"` en resultado de pago, advertencias y cambios de prima |
| Formularios | Etiqueta asociada a cada campo; errores vinculados con `aria-describedby` |
| Movimiento | `prefers-reduced-motion` respetado |
| Herramientas | `axe-core` en CI sobre las pantallas del embudo |

---

## 14. Voz y tono (copy)

**Persona**: un asesor que te explica sin jerga ni presión. Español de Perú, trato de **"tú"**, frases cortas, verbos de acción.

| En lugar de… | Escribir… |
|---|---|
| "Complete el formulario" | "Cuéntanos de tu auto" |
| "Siniestro" (en la interfaz principal) | "Si te pasa algo" / "choque o robo"; "siniestro" solo en el apartado informativo |
| "Deducible" sin explicar | "Lo que pagas tú en un choque (deducible)" |
| "Costo Real Anual" | "Lo que pagarías en un año malo" *(hipótesis a validar, doc de arquitectura §17.1)* |
| "Error 409" | Texto del backend en lenguaje llano ("Otro asesor tomó este caso.") |
| "Cotiza tu seguro" (último botón del wizard) | "Ver mis cotizaciones" |
| "Un asesor te llamará" (como único camino) | "Compra ahora o habla con un asesor, tú eliges" |

**Botones**: verbo + resultado ("Comprar este plan", "Descargar mi póliza"). Evitar "Enviar", "Aceptar", "OK".

**Leyendas obligatorias** (siempre visibles, nunca ocultables):
- Prueba de Choque: «Estimación referencial basada en condiciones resumidas. Prevalece el condicionado de la aseguradora.» (RN-29)
- Detalle y comparador de planes, póliza: «Contenido ilustrativo; no es el condicionado de la aseguradora.» (RN-46)
- PDF y footer en demostración: «Documento de demostración sin validez legal» (RNF-20)

**Evitar**: urgencia falsa ("¡Solo hoy!"), cuentas regresivas, "ahorra hasta X %" sin condiciones visibles (en la web actual el 35 % tiene un "ver condiciones" que se mantiene), mayúsculas completas en frases largas.

---

## 15. Implementación: tokens CSS, Tailwind y shadcn

### 15.1 `design-system/tokens/colors.css`

```css
:root {
  /* Marca */
  --color-brand-50:  #FDE8EF;
  --color-brand-100: #FAC7D8;
  --color-brand-300: #F26B96;
  --color-brand-500: #E6004D;
  --color-brand-600: #C20040;
  --color-brand-700: #9F0036;
  --color-brand-900: #5C0020;

  /* Azul marino */
  --color-navy-50:  #E8F0FA;
  --color-navy-100: #C9DAF0;
  --color-navy-500: #1F5AA0;
  --color-navy-700: #0B3C75;
  --color-navy-800: #14365F;
  --color-navy-900: #0F1E33;

  /* Turquesa (Prueba de Choque) */
  --color-accent-50:  #E3F5F5;
  --color-accent-500: #00A6A6;
  --color-accent-600: #00807F;
  --color-accent-700: #006466;

  /* Neutros */
  --color-bg-canvas:        #F3F4F6;
  --color-bg-surface:       #FFFFFF;
  --color-bg-surface-muted: #EEF1F5;
  --color-border-default:   #DDE2EA;
  --color-text-primary:     #1B2430;
  --color-text-secondary:   #5B6676;
  --color-footer-bg:        #3B3B3F;

  /* Estados */
  --color-status-pending:     #8A5A00;
  --color-status-in-progress: #2563EB;
  --color-status-success:     #15803D;
  --color-status-danger:      #B91C1C;
  --color-status-neutral:     #6B7280;
  --color-status-warning:     #D97706;
  --color-status-info:        #0E7490;

  /* Escala de desembolso */
  --color-out-0: #E6F4EA;
  --color-out-1: #FFF4D6;
  --color-out-2: #FFE0C7;
  --color-out-3: #FBD0CC;
}

/* Modo oscuro: solo backoffice (clase en <html data-theme="dark">) */
[data-theme="dark"] {
  --color-bg-canvas:        #0F1E33;
  --color-bg-surface:       #14253D;
  --color-bg-surface-muted: #1B2F4A;
  --color-border-default:   #2B4262;
  --color-text-primary:     #E8EEF6;
  --color-text-secondary:   #A8B8CC;
  --color-footer-bg:        #0A1626;

  --color-brand-500: #FF4D82;   /* sobre #0F1E33: 5.3:1 */
  --color-brand-600: #FF7AA3;
  --color-accent-600: #2CC3C2;

  --color-status-pending:     #E3AE4F;
  --color-status-in-progress: #6B9BF5;
  --color-status-success:     #4ADE80;
  --color-status-danger:      #F87171;
  --color-status-neutral:     #9CA3AF;
  --color-status-warning:     #FBBF24;
  --color-status-info:        #22D3EE;

  --color-out-0: #14271B;
  --color-out-1: #2C2412;
  --color-out-2: #33200F;
  --color-out-3: #3A1714;
}
```

> En modo oscuro, el texto sobre `brand-500` es `#0F1E33` (no blanco). Verificar con `axe` al construir.

### 15.2 `design-system/tailwind.config.ts` (extracto)

```ts
theme: {
  extend: {
    colors: {
      brand: { 50:'var(--color-brand-50)', 100:'var(--color-brand-100)', 300:'var(--color-brand-300)',
               500:'var(--color-brand-500)', 600:'var(--color-brand-600)', 700:'var(--color-brand-700)',
               900:'var(--color-brand-900)', DEFAULT:'var(--color-brand-500)' },
      navy:  { 50:'var(--color-navy-50)', 100:'var(--color-navy-100)', 500:'var(--color-navy-500)',
               700:'var(--color-navy-700)', 800:'var(--color-navy-800)', 900:'var(--color-navy-900)' },
      accent:{ 50:'var(--color-accent-50)', 500:'var(--color-accent-500)',
               600:'var(--color-accent-600)', 700:'var(--color-accent-700)', DEFAULT:'var(--color-accent-600)' },
      canvas:'var(--color-bg-canvas)', surface:'var(--color-bg-surface)',
      'surface-muted':'var(--color-bg-surface-muted)', line:'var(--color-border-default)',
      ink:'var(--color-text-primary)', 'ink-soft':'var(--color-text-secondary)',
      status: { pending:'var(--color-status-pending)', progress:'var(--color-status-in-progress)',
                success:'var(--color-status-success)', danger:'var(--color-status-danger)',
                neutral:'var(--color-status-neutral)', warning:'var(--color-status-warning)',
                info:'var(--color-status-info)' },
      out: { 0:'var(--color-out-0)', 1:'var(--color-out-1)', 2:'var(--color-out-2)', 3:'var(--color-out-3)' },
    },
    fontFamily: {
      sans: ['Lato', 'system-ui', 'sans-serif'],
      money:['Inter', 'system-ui', 'sans-serif'],
      mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
    },
    borderRadius: { lg:'8px', xl:'12px', '2xl':'16px' },
    boxShadow: {
      card:  '0 2px 8px rgb(15 30 51 / 0.08)',
      float: '0 8px 24px rgb(15 30 51 / 0.14)',
    },
  },
},
```

### 15.3 Mapeo a shadcn/ui

En `src/index.css` (variables que shadcn espera):

```css
:root {
  --background: var(--color-bg-canvas);
  --foreground: var(--color-text-primary);
  --card: var(--color-bg-surface);
  --card-foreground: var(--color-text-primary);
  --primary: var(--color-brand-500);
  --primary-foreground: #FFFFFF;
  --secondary: var(--color-navy-50);
  --secondary-foreground: var(--color-navy-700);
  --muted: var(--color-bg-surface-muted);
  --muted-foreground: var(--color-text-secondary);
  --accent: var(--color-accent-600);
  --accent-foreground: #FFFFFF;
  --destructive: var(--color-status-danger);
  --border: var(--color-border-default);
  --input: var(--color-border-default);
  --ring: var(--color-brand-300);
  --radius: 0.5rem;
}
```

Variantes del `Button` de shadcn a agregar en `shared/ui/button.tsx`: `accent` (Prueba de Choque), `outlineNavy` y `secondary` con borde carmesí.

---

## 16. Checklist de diseño por pantalla

- [ ] Un solo botón `primary` por pantalla; el resto es secundario o texto.
- [ ] Todo monto usa `<MoneyValue>`; prima mensual como protagonista.
- [ ] Ningún estado o nivel depende solo del color.
- [ ] Turquesa solo en Prueba de Choque; ningún error usa carmesí de marca.
- [ ] Leyendas obligatorias presentes y no ocultables (RN-29, RN-46, RNF-20).
- [ ] Estados `loading`, `empty`, `error`, `success` diseñados con esqueletos de forma final.
- [ ] Probado en 360 px sin scroll horizontal de página y en 1280 px.
- [ ] Inputs de 16 px mínimo; objetivos táctiles ≥ 44 px.
- [ ] Contraste revisado con `axe`; foco visible en todos los controles.
- [ ] Textos revisados con la guía de voz (sección 14).
- [ ] Backoffice revisado en modo oscuro.
- [ ] Ningún valor hex directo en componentes; solo tokens.

---

## 17. Decisiones abiertas

Cosas que conviene confirmar antes de construir (ninguna bloquea empezar la Ola 0):

1. **Colores medidos de las aseguradoras**: pegar hex en 3.6 para afinar la comparación de las tarjetas de plan.
2. **Carmesí exacto de la marca**: `#E6004D` es una aproximación de las capturas; si existe manual de marca de SeguroSimple, reemplazar los tokens `brand-*` (el resto no cambia).
3. **Tipografía**: se asumió Lato por la web actual; si el logo o el manual usan otra familia, cambiar `fontFamily.sans`.
4. **`<PromoBanner>`**: confirmar si la promoción "SOAT gratis de por vida" forma parte del alcance del sistema (el documento de dominio deja fuera el SOAT, §12) o si es solo contenido de marketing editable.
5. **Nombre comercial de la métrica**: validar con 5 usuarios si "Costo Real Anual" se entiende o si se usa "Lo que pagarías en un año malo" (arquitectura §17.1).
6. **Modo oscuro del embudo**: hoy solo backoffice; si se quiere también para el cliente, definir variantes de logo y de ilustraciones.
7. **Imágenes del hero**: ilustración propia vs fotografía; decidir antes de la landing.

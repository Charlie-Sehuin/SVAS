# Guía de tarifas y pesos — qué se cambia dónde

> Para quien mantiene las tarifas: cuándo basta con usar las pantallas del administrador y cuándo hay
> que tocar código en el backend **y** en el frontend.
>
> Léela junto con `contexto-dominio-seguro-simple.md` §17 (cómo se calcula una prima; **manda en caso de
> conflicto**) y `estado-implementacion.md` §1b (qué hace el frontend).
>
> **Dos repos.** Las rutas que empiezan con `svas-backend/` son de este repo (`SVAS`). Las que empiezan con `src/`
> son del repo del frontend: https://github.com/Charlie-Sehuin/SVAS-frontend. Un cambio de forma suele necesitar un
> PR en cada uno.

---

## 0. La regla en una línea

- **Cambiar valores** (un peso, una tasa, un rango) → pantalla del administrador. **No se toca código.**
- **Cambiar la forma** (qué pesos usa una aseguradora, qué parámetros tiene un plan, una aseguradora nueva)
  → código en el backend y en un archivo del frontend.

---

## 1. Cambiar valores: sin código

Entra con el usuario ADMINISTRADOR a `/app/admin/tarifas/...`.

| Quiero cambiar | Pantalla | Cómo |
|---|---|---|
| El peso de una marca, modelo, año, tipo o distrito | **Pesos** | Elige aseguradora y tabla, edita la celda, **Guardar** |
| Muchos pesos a la vez | **Pesos** | **Descargar CSV**, edita en Excel, **Cargar CSV**, revisa y **Guardar** |
| La tasa base de un plan | **Tasa base** | Edita y **Guardar tarifa** |
| El cargo fijo, el recargo por cuotas, la prima mínima o el descuento comercial | **Tasa base** | Es un parámetro del plan: se edita en la misma tarjeta |
| La suma mínima o máxima de un modelo y año | **Rangos de suma** | Elige aseguradora y marca, edita, **Guardar** |
| Comprobar que quedó bien | **Simulador** y **Completitud** | Mira el desglose de la prima y que no falte nada |

Reglas que el sistema ya valida:

- Un peso va de **0,500 a 3,000**, con hasta 3 decimales. Menor que 1 es descuento; mayor que 1, recargo.
- La tasa base va de **0,0001 a 0,9999** (0,0420 = 4,2 %).
- Un peso faltante hace que esa aseguradora **no cotice** ese vehículo (RN-39). **Completitud** lo muestra.
- Cada guardado queda en la **Bitácora** con el antes y el después.

Un cambio de valores rige desde la siguiente cotización. Las cotizaciones ya hechas no se recalculan.

---

## 2. Cambiar la forma: hay que tocar código

El backend **no** le dice al frontend qué pesos usa cada aseguradora ni qué parámetros tiene cada plan.
Esa información está copiada a mano en un solo archivo del frontend:

```
src/shared/lib/tarifas.constants.ts
```

Ese archivo solo decide **qué se muestra**: qué pestañas de pesos aparecen y qué campos tiene el formulario
de cada plan. La fórmula vive únicamente en el backend (RN-40) y el backend vuelve a validar todo lo que se
guarda. Si el frontend queda desactualizado, **no se calcula mal**: se muestra de menos o de más, o el
backend rechaza el guardado con un mensaje.

### Caso A · Una aseguradora usa un peso distinto

Ejemplo: Rímac empieza a usar el peso por tipo de vehículo.

1. **Backend** — `svas-backend/src/integracion/estrategias/estrategia-rimac.ts`:
   agrega `'tipo'` a `pesosRequeridos` (o a `pesosOpcionales` si no debe bloquear la cotización) y usa
   `w.tipo` en `primaAnual()`.
2. **Backend** — actualiza la prueba de la estrategia en `estrategias.spec.ts`.
3. **Datos** — carga los pesos de tipo para esa aseguradora (pantalla **Pesos**, tabla "Tipo de vehículo").
   Mientras falten, **Completitud** mostrará "Falta peso de tipo de vehículo" y no cotizará.
4. **Frontend** — en `tarifas.constants.ts`, dentro de `PESOS_POR_ESTRATEGIA`, agrega `'tipo'` a
   `requeridos` (u `opcionales`) de `RIMAC`.

> Hazlo en este orden y en el mismo despliegue. Si publicas el backend antes de cargar los pesos, esa
> aseguradora deja de cotizar hasta que los cargues.

### Caso B · Un plan tiene un parámetro nuevo o distinto

Ejemplo: Mapfre agrega un `cargo_administrativo`.

1. **Backend** — en `estrategia-mapfre.ts`, agrega la clave a `parametrosSchema` (zod) y úsala en `primaAnual()`.
   El esquema es `.strict()`: el backend **rechaza** cualquier clave que no esté ahí.
2. **Datos** — los planes que ya existen necesitan el valor nuevo: guárdalo desde **Tasa base** o con una
   migración. Un plan sin el parámetro falla al validar.
3. **Frontend** — en `tarifas.constants.ts`, dentro de `PARAMETROS_POR_ESTRATEGIA`, agrega un objeto a `MAPFRE`:

   ```ts
   {
     clave: 'cargo_administrativo',     // idéntica a la del backend
     etiqueta: 'Cargo administrativo (USD)',
     ayuda: 'Monto que se suma a la prima.',
     tipo: 'monto',                     // 'monto' = USD · 'fraccion' = 0.05 = 5 %
     min: 0,
     max: 1000,                         // los mismos límites que el zod del backend
   }
   ```

   `minExclusivo` y `maxExclusivo` existen para los casos "mayor que" y "menor que" (mira `recargo_pago_mensual`).

### Caso C · Una aseguradora nueva

Es la receta de `contexto-dominio-seguro-simple.md` §17.11, más estos dos pasos del frontend.

1. **Backend** — clase nueva en `svas-backend/src/integracion/estrategias/` que extienda `EstrategiaBase`.
2. **Backend** — agrega su código a `CODIGOS_ESTRATEGIA` en
   `svas-backend/src/modules/cotizacion/domain/estrategia-cotizacion.port.ts` y una línea en
   `estrategia.registry.ts`.
3. **Datos** — fila en `aseguradora` con ese `codigo_estrategia` (solo mayúsculas y guion bajo), sus planes,
   `tarifa_plan`, rangos y pesos.
4. **Frontend** — en `tarifas.constants.ts` agrega su entrada en `PESOS_POR_ESTRATEGIA` y en
   `PARAMETROS_POR_ESTRATEGIA` (usa `[]` si no tiene parámetros).
5. **Frontend** — agrega el código al tipo `CodigoEstrategia` de
   `src/shared/types/api/admin.types.ts` y su nombre en `NOMBRE_ESTRATEGIA` de
   `src/features/administracion/pages/AseguradorasPlanesPage.tsx`.

Si olvidas el paso 4, la pantalla **no se rompe**: usa lo de la clase base (marca, modelo y año como pesos
requeridos, sin parámetros de plan). Solo que no verá los pesos ni parámetros propios de esa aseguradora.

### Caso D · Una tabla de pesos nueva (ejemplo: color)

Es el cambio más grande. Además de los pasos anteriores:

1. **Base de datos** — migración nueva con la tabla (sigue el modelo de `0006_tarifas.sql`: clave compuesta
   `aseguradora_id` + la clave, `check (peso between 0.5 and 3)`, RLS solo ADMINISTRADOR) y su RPC de carga
   (sigue el modelo de `0023`). Nunca edites una migración ya aplicada.
2. **Backend** — agrega el nombre a `TABLAS_PESO` (`modules/administracion/domain/tarifas.ts`), a `PesoNombre`
   (`modules/cotizacion/domain/tarifa.types.ts`) y la regla de formato de su clave en `claveValida()`.
   Carga los pesos en el repositorio de tarifas para que lleguen a `TarifaAseguradora`.
3. **Frontend** — agrega el nombre a `TablaPeso` en `admin.types.ts` y a `NOMBRE_PESO` en
   `tarifas.constants.ts`; úsalo en `PESOS_POR_ESTRATEGIA`.
4. **Frontend** — en `TarifasPesosPage.tsx`, agrega el formato de su clave a `claveValida()` (lo usa la carga de
   CSV) y revisa qué se muestra como nombre de fila.

---

## 3. Si cambian los límites

Los límites están en **tres** lugares y deben coincidir:

| Límite | Base de datos | Backend | Frontend |
|---|---|---|---|
| Peso 0,5 – 3 | `check` de cada tabla `peso_*` | `FilaPesoDto` en `tarifas-admin.dto.ts` | `PESO_MIN` y `PESO_MAX` en `tarifas.constants.ts` |
| Tasa base | `tarifa_plan` | `GuardarTarifaPlanDto` | `TASA_MIN`, `TASA_MAX`, `TASA_DECIMALES` |
| Parámetro de plan | — | `parametrosSchema` de la estrategia | `min` y `max` del parámetro |

Si el frontend es más estricto que el backend, el administrador no podrá guardar valores válidos. Si es más
laxo, el backend responderá con su mensaje y el formulario lo mostrará bajo el campo.

---

## 4. Lista de comprobación después de un cambio de forma

- [ ] `npm test` en `svas-backend` (la prueba de estrategias y la tabla dorada de §17.6).
- [ ] `npm run typecheck`, `npm run lint` y `npm test` en el repo `SVAS-frontend`.
- [ ] En **Tasa base**, el formulario de cada plan de la aseguradora tiene los campos correctos y guarda sin error.
- [ ] En **Pesos**, aparecen exactamente las tablas que usa la fórmula.
- [ ] En **Completitud**, la aseguradora no tiene pendientes (o son los esperados).
- [ ] En el **Simulador**, el desglose de la aseguradora muestra los pasos nuevos y la prima es la esperada.
- [ ] Actualiza la fila de §17.4 de `contexto-dominio-seguro-simple.md` (qué usa cada aseguradora).

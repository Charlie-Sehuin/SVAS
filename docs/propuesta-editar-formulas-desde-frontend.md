# Propuesta: editar las fórmulas desde el frontend

> **Estado: propuesta, no implementada.** Hoy la fórmula de cada aseguradora es código del backend y no se puede
> editar desde el frontend. Este documento explica cómo se haría para que un administrador la edite en pantalla y
> quede guardada y aplicada en el backend, con qué reglas, y qué habría que decidir antes.
>
> Para quien decide si se hace y para quien lo construiría. Léelo con `contexto-dominio-seguro-simple.md` §17
> (**manda en caso de conflicto**) y `guia-tarifas-pesos.md` (lo que sí se puede cambiar hoy).

---

## 0. Resumen en 30 segundos

- **Hoy** el administrador cambia *valores* (pesos, tasas, rangos, parámetros) desde pantalla, pero la *fórmula*
  (cómo se combinan) está escrita en TypeScript: una clase por aseguradora. Cambiarla exige un programador y un despliegue.
- Eso es una **decisión de diseño explícita** del documento de dominio: **RN-40** dice "no hay lógica de tarifa en SQL ni
  en el frontend" y §17.2 "datos en tablas, fórmula en código".
- Para editar la fórmula desde el frontend hay que **cambiar esa regla** y convertir la fórmula en un **dato**.
- Lo seguro es una **fórmula declarativa**: el administrador arma la fórmula con bloques permitidos (multiplicar, sumar,
  máximo, un peso, un parámetro…). Se guarda como JSON versionado y el backend la interpreta con `decimal.js`.
  **Nunca** se ejecuta texto ni código escrito por el usuario.
- Cada cambio pasa por **borrador → prueba → publicar**, con historial y vuelta atrás, porque una fórmula mal puesta
  cambia el precio de todos los clientes.
- Como extra, el frontend dejaría de copiar a mano qué pesos y parámetros usa cada aseguradora
  (`src/shared/lib/tarifas.constants.ts`): los leería de la fórmula.

---

## 1. Qué significa "editar la fórmula": cuatro niveles

| Nivel | Qué edita el administrador | Seguridad | Veredicto |
|---|---|---|---|
| **0 · Hoy** | Valores: pesos, tasa base, parámetros, rangos | Alta: el backend valida todo | Ya existe |
| **1 · Fórmula declarativa** | Arma la fórmula con bloques permitidos | Alta: lista cerrada de operaciones, sin ejecutar código | **Recomendado** |
| **2 · Texto libre** | Escribe `S * tb * wM ...` como expresión | Media: hay que escribir y blindar un intérprete; errores difíciles de explicar | No recomendado |
| **3 · Subir código** | Sube TypeScript | Inaceptable: ejecutar código ajeno en el servidor | Descartado |

El resto del documento desarrolla el nivel 1.

---

## 2. Qué dice el documento de dominio y qué habría que enmendar

El documento de dominio **manda**, así que esto no se hace "por debajo": primero se enmienda y luego se construye.

| Dónde | Dice hoy | Habría que decir |
|---|---|---|
| RN-40 | Las fórmulas viven en TypeScript puro, una clase por aseguradora | Las fórmulas viven en el backend como **definiciones declarativas versionadas**, interpretadas por un evaluador único. Las clases actuales son la versión inicial |
| §17.2 | Fórmula = código | Fórmula = dato versionado; el **evaluador** es el código |
| §17.11 | Agregar aseguradora = datos + una clase nueva | Agregar aseguradora = datos + una fórmula en pantalla (la clase solo hace falta si pide un paso que los bloques no cubren) |
| RN-41 | Cada prima guarda su `detalle_calculo` | Además guarda **qué versión de fórmula** la calculó |

Lo que **no** cambia: RN-37 (suma dentro del rango), RN-38 (cuotas), RN-39 (qué pasa si falta un peso) y la regla de que
el frontend nunca calcula una prima.

---

## 3. Diseño recomendado

### 3.1 El lenguaje de bloques

Una fórmula es un árbol de nodos. Solo existen estos:

| Nodo | Significa | Ejemplo |
|---|---|---|
| `suma` | La suma asegurada S | `{ "op": "suma" }` |
| `tasa_base` | La tasa base del plan | `{ "op": "tasa_base" }` |
| `peso` | El peso de marca, modelo, año, tipo o distrito | `{ "op": "peso", "tabla": "marca" }` |
| `parametro` | Un parámetro del plan (cargo fijo, mínima…) | `{ "op": "parametro", "clave": "cargo_fijo_anual" }` |
| `const` | Un número fijo (como texto, para no perder decimales) | `{ "op": "const", "valor": "1" }` |
| `mul` · `add` · `sub` · `div` | Operaciones con 2 o más argumentos | `{ "op": "mul", "args": [ … ] }` |
| `max` · `min` | El mayor o el menor | `{ "op": "max", "args": [ … ] }` |

Reglas del lenguaje:

- **Todo es `decimal.js`**, nunca números de punto flotante.
- Profundidad máxima del árbol y número máximo de nodos (p. ej. 40) para que nadie arme algo enorme.
- `peso` puede llevar `"opcional": true`: si falta el peso, se usa 1,000 (así funciona hoy el distrito de Pacífico).
  Los pesos **no opcionales** que aparecen en la fórmula son los que, si faltan, hacen que esa aseguradora no cotice
  (RN-39). **Se deducen de la propia fórmula**: nadie tiene que declararlos aparte.
- Una fórmula tiene dos expresiones: `prima_anual` (obligatoria) y `total_en_cuotas` (opcional; si no hay, es igual a la
  prima anual, como hoy salvo La Positiva).
- **Siguen fijos en código**, igual para todas: el redondeo a 2 decimales half-up, la cuota mensual (total en cuotas ÷ 12)
  y la forma del `detalle_calculo`.

### 3.2 Las cinco fórmulas actuales dicen esto

Se tradujeron desde las clases reales de `svas-backend/src/integracion/estrategias/`:

| Aseguradora | `prima_anual` | `total_en_cuotas` |
|---|---|---|
| Rímac | `S × tb × wMarca × wModelo × wAño` | = prima anual |
| Pacífico | `S × (tb × wMarca × wModelo × wAño × wDistrito*) + cargo_fijo_anual` | = prima anual |
| La Positiva | `S × tb × wMarca × wModelo × wAño × wTipo` | `prima × (1 + recargo_pago_mensual)` |
| Mapfre | `max( S × tb × wMarca × wModelo × wAño , prima_minima_anual )` | = prima anual |
| Qualitas | `S × tb × ((wMarca + wModelo + wAño) ÷ 3) × (1 − descuento_comercial)` | = prima anual |

\* `wDistrito` es opcional en Pacífico (sin peso usa 1,000).

Ejemplo de Mapfre como JSON:

```json
{
  "prima_anual": {
    "op": "max",
    "args": [
      { "op": "mul", "args": [
          { "op": "suma" }, { "op": "tasa_base" },
          { "op": "peso", "tabla": "marca" },
          { "op": "peso", "tabla": "modelo" },
          { "op": "peso", "tabla": "anio" } ] },
      { "op": "parametro", "clave": "prima_minima_anual" }
    ]
  }
}
```

Esta traducción es también la **prueba de que el lenguaje alcanza**: si las cinco fórmulas actuales caben sin forzar
nada, el lenguaje cubre el negocio de hoy.

### 3.3 Dónde se guarda

Una tabla nueva, por migración nueva (nunca se edita una migración ya aplicada):

```
formula_aseguradora
  id, aseguradora_id, version (entero que sube de 1 en 1)
  estado: BORRADOR | PUBLICADA | ARCHIVADA
  prima_anual jsonb, total_en_cuotas jsonb (puede ser null)
  parametros jsonb      ← qué parámetros de plan exige (clave, etiqueta, mínimo, máximo)
  nota text, creada_por, creada_en, publicada_en
```

- **Una sola PUBLICADA por aseguradora** (índice único parcial).
- Solo el ADMINISTRADOR; lecturas con RLS; escrituras por RPC `SECURITY DEFINER` que dejan la **bitácora con antes y
  después**, siguiendo las convenciones del backend.
- `prima_cotizada.detalle_calculo` suma `formulaId` y `formulaVersion`. Una cotización ya hecha **no cambia** (RN-41) y una
  orden de compra ya creada **conserva** su monto.

### 3.4 Qué cambia en el backend

1. **Evaluador puro** `EstrategiaDeclarativa`: implementa el mismo puerto que las clases de hoy, recibe el JSON y lo
   evalúa con `decimal.js`. Sin `eval`, sin `new Function`, sin acceso a nada fuera de S, tasa, pesos y parámetros. Es una
   función pura: se prueba sin base de datos, como las estrategias actuales.
2. **Validador (zod)** del árbol: solo nodos permitidos, profundidad y tamaño máximos, tablas de peso que existen,
   parámetros declarados, sin divisiones por una constante cero, al menos un nodo `suma`.
3. **Registro**: `EstrategiaRegistry.obtener(codigo)` busca primero la fórmula **publicada** en base de datos (con caché de
   5 minutos que se invalida al publicar, como las tarifas). Si no hay, usa la clase de código. Así la migración es gradual
   y se puede volver atrás sin tocar el cálculo.
4. **Endpoints** (todos ADMINISTRADOR, errores con el mismo formato y la ruta del nodo que falló):

   | Endpoint | Para qué |
   |---|---|
   | `GET /admin/formulas?aseguradoraId=` | Versiones de una aseguradora |
   | `POST /admin/formulas` | Crear un borrador (copia de la publicada) |
   | `PUT /admin/formulas/:id` | Editar un borrador |
   | `POST /admin/formulas/:id/simular` | Calcular con el borrador, **sin publicar ni guardar nada** |
   | `POST /admin/formulas/:id/publicar` | Publicar (valida y compara antes) |
   | `POST /admin/formulas/:id/revertir` | Volver a una versión anterior (se publica como versión nueva) |

### 3.5 Las reglas que lo hacen seguro

Cambiar una fórmula cambia el precio de **todas** las cotizaciones nuevas. Por eso:

- **Borrador → prueba → publicar.** Nada se aplica hasta publicar.
- **Los casos de oro son la compuerta.** La tabla de §17.6 (el mismo auto frente a las cinco aseguradoras) ya existe y la
  prueba e2e la verifica. La fórmula semilla de cada aseguradora **debe dar exactamente esos números** antes de reemplazar
  a la clase.
- **Comparación antes de publicar:** el backend calcula una muestra (p. ej. 200 combinaciones de modelo, año y distrito) con
  la versión publicada y con el borrador, y muestra la variación. El administrador confirma viendo el impacto.
- **Chequeos de cordura que bloquean:** prima mayor que 0, menor o igual a la suma asegurada, sin resultados negativos ni
  vacíos en toda la muestra.
- **Historial y vuelta atrás en un clic**, con la bitácora completa.
- **Opcional, a decidir:** que publicar necesite la confirmación de un segundo administrador.

### 3.6 Qué cambia en el frontend

Una pantalla nueva `Tarifas · Fórmulas` (`/app/admin/tarifas/formulas`):

1. **Lista** de aseguradoras con su versión publicada y la fórmula **escrita en palabras**, generada del JSON de forma
   automática (por ejemplo: "prima anual = suma asegurada × tasa base × peso de marca × …"). Esto solo ya resuelve la
   duda de "dónde veo la fórmula".
2. **Editor por bloques**: un árbol visual donde se agrega o quita un bloque, se elige la operación y se escoge el peso
   o parámetro de una lista. **No se escribe código ni texto libre.**
3. **Parámetros del plan**: se declara qué parámetros tiene la aseguradora (nombre, etiqueta, mínimo, máximo).
4. **Panel de prueba**: vehículo, distrito y suma → calcula el borrador con `/simular` y lo muestra **al lado de la
   versión publicada**, con el desglose.
5. **Guardar borrador · Publicar · Descartar**, y el **historial** con comparación entre versiones y "Restaurar".
6. Los errores del backend se muestran junto al bloque que falló, con el mensaje tal cual.

Efecto lateral bueno: `src/shared/lib/tarifas.constants.ts` (la copia manual de qué pesos y parámetros usa cada
aseguradora) **desaparece**. La pantalla de Pesos y los formularios de Tasa base leerían esa información de la fórmula
publicada, y la sección 2 de `guia-tarifas-pesos.md` se simplifica mucho.

### 3.7 Qué no cubre este diseño

Condicionales por tramos ("si la suma pasa de X, otra tasa"), tablas de tramos y datos externos no caben en los bloques
de arriba. Si el negocio los pide, hay dos caminos: sumar un nodo `si` con comparaciones (sigue siendo declarativo) o dejar
esa aseguradora en código. Se decide cuando aparezca el caso, no antes.

---

## 4. Alternativas

| Opción | Ventaja | Problema |
|---|---|---|
| **A. Dejarlo como hoy** | Cero riesgo; la fórmula se prueba con tests y se revisa en un PR | Cambiar una fórmula necesita un programador y un despliegue |
| **B. Declarativa por bloques** (esta propuesta) | Edición segura en pantalla, historial, pruebas antes de publicar | Hay que construirla y enmendar RN-40 |
| **C. Texto libre con un intérprete** (p. ej. `mathjs`) | Más flexible | Más superficie de ataque, errores difíciles de explicar, hay que blindar el intérprete |
| **D. Subir código** | — | No se hace |

---

## 5. Plan por tandas

Cada tanda se puede entregar y probar sola.

| Tanda | Qué se entrega | Se considera lista cuando |
|---|---|---|
| **1 · Base** | Enmendar RN-40, §17.2, §17.11 y RN-41. Migración con `formula_aseguradora`. Evaluador puro con validador y las 5 fórmulas como semilla | La semilla da **exactamente** la tabla de §17.6 y pasan las pruebas de las cinco estrategias. Aún sin pantalla |
| **2 · API** | Endpoints, simular borrador, publicar y revertir, bitácora, caché | Pruebas con rollback, igual que el resto de migraciones, y un caso de Bruno por endpoint |
| **3 · Ver** (frontend) | Pantalla de lectura: fórmula en palabras e historial | Cada aseguradora muestra su fórmula publicada. **Sin riesgo**: no edita nada |
| **4 · Editar** (frontend) | Editor por bloques, panel de prueba al lado de la publicada, publicar con comparación | Se crea una versión, se prueba, se publica y se revierte sin errores |
| **5 · Limpiar** | El frontend lee pesos y parámetros de la API; se borra `tarifas.constants.ts` | Ninguna pantalla depende de datos copiados a mano |

Las tandas 1 y 2 son de backend; 3 a 5, de frontend.

---

## 6. Qué hay que decidir antes de empezar

- [ ] ¿Se aprueba **enmendar RN-40**? Es el cambio de fondo: la fórmula pasa de código a dato.
- [ ] ¿Basta **un** administrador para publicar o se exige **un segundo** que confirme?
- [ ] ¿El lenguaje queda con los bloques de la sección 3.1 o se agrega un nodo `si` desde el inicio?
- [ ] ¿Se publica cuando se quiera o con una ventana (p. ej. solo en horario de baja demanda)?
- [ ] ¿Cuántas combinaciones de la muestra y qué variación máxima se avisa antes de publicar?

---

## 7. Mientras tanto

Lo que ya se puede hacer sin esto está en `guia-tarifas-pesos.md`: cambiar pesos, tasas, parámetros y rangos desde la
pantalla, y la receta para cambiar la **forma** (otra tabla de pesos, otro parámetro, otra aseguradora) tocando código.

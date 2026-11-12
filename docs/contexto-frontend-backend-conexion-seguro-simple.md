# Contexto de Conexión Frontend ↔ Backend
## SeguroSimple — Sistema de Venta Autónoma de Seguros (SVAS)

> Contrato entre la SPA (React) y la API (NestJS). Ante conflicto con
> `contexto-dominio-seguro-simple.md`, manda el documento de dominio.

---

## 1. URLs del Backend

| Entorno | URL base |
|---|---|
| **Producción (Railway)** | `https://svas-backend-production.up.railway.app/api/v1` *(reemplazar por la URL real)* |
| **Swagger** | `https://<backend>/api/docs` |
| **Local** | `http://localhost:3000/api/v1` |
| **Frontend (Vercel)** | `https://svas-frontend.vercel.app` *(CORS permitido)* |

> **Plan gratuito**: si el servicio se suspende por inactividad, la primera
> request puede tardar. El frontend muestra "Estamos despertando el
> servidor…" después de 4 s (doc frontend 4.3).

---

## 2. Autenticación

**Supabase Auth** con JWT. El navegador usa `supabase-js` **solo** para
sesión; todo lo demás va a la API.

### Flujo de login
```
POST /api/v1/auth/login
Body: { email, password }
Respuesta: { access_token, refresh_token, expires_in, user: { id, email, roles, nombreCompleto } }
```

### Registro mínimo (dentro del embudo, siempre rol CLIENTE)
```
POST /api/v1/auth/registro
Body: { nombres, apellidos, email, password, telefono, cotizacionId? }
```
Si llega `cotizacionId` junto con el header `X-Cotizacion-Token`, el
backend vincula la cotización anónima al nuevo cliente. Un usuario nunca
puede auto-asignarse `ASESOR` o `ADMINISTRADOR`.

### Cómo enviar credenciales
| Situación | Header |
|---|---|
| Usuario con sesión | `Authorization: Bearer <access_token>` |
| Cliente anónimo con cotización | `X-Cotizacion-Token: <tokenAcceso>` |
| Pago | además `Idempotency-Key: <uuid por intento>` |

### JWT decodificado
```json
{
  "sub": "uuid-del-usuario",
  "email": "cliente@example.com",
  "role": "authenticated",
  "app_metadata": { "provider": "email", "roles": ["CLIENTE"] },
  "user_metadata": { "full_name": "Nombre Cliente" }
}
```
**Regla crítica**: los roles de negocio viven en `app_metadata.roles`
(sincronizado desde `svas.usuario.rol`), **nunca** en `user_metadata`.

### Endpoints públicos (sin JWT)
- `POST /auth/login`, `POST /auth/registro`, `POST /auth/refresh`
- `GET /health/live`, `GET /health/ready`
- `GET /catalogo/campos`
- `GET /catalogo/vehiculos/marcas`, `GET /catalogo/vehiculos/marcas/:marcaId/modelos`,
  `GET /catalogo/vehiculos/modelos/:modeloId/anios`
- `GET /catalogo/ubigeos/departamentos`, `/provincias`, `/distritos`
- `POST /cotizaciones` (devuelve `tokenAcceso`)
- `GET /prueba-choque/escenarios`
- `GET /planes/:planId/contenido`, `GET /planes/comparar?ids=` ★ (contenido comercial: información pública)
- `GET /retoma/:token`
- Con `X-Cotizacion-Token` (sin JWT): `GET /cotizaciones/:id/resumen`,
  `PATCH /cotizaciones/:id/aseguradoras/:aseguradoraId/suma-asegurada`,
  `POST|GET /cotizaciones/:id/prueba-choque`,
  `GET /cotizaciones/:id/prueba-choque/pdf`

---

## 3. Los 3 roles del sistema (+ anónimo)

| Rol | Descripción |
|---|---|
| *(anónimo)* | Cotiza, compara y usa la Prueba de Choque con su token |
| `CLIENTE` | Compra, solicita asesoría, consulta sus cotizaciones, pólizas y pagos |
| `ASESOR` | Atiende la cola de asesoría, negocia dentro del tope y gestiona el seguimiento (incluye telemarketing) |
| `ADMINISTRADOR` | Catálogo, parámetros, reglas de la Prueba de Choque, usuarios, reportes y bitácora |

---

## 4. Matriz de pantallas por rol

| Pantalla | Anónimo | CLIENTE | ASESOR | ADMINISTRADOR |
|---|---|---|---|---|
| Landing / Cotizar | ✅ | ✅ | ❌ | ✅ (prueba) |
| Comparativo | ✅ token | ✅ | ❌ | ✅ |
| Ajustar suma asegurada | ✅ token | ✅ | ❌ | ✅ |
| ★ Detalle del plan (qué cubre / no cubre / requisitos) | ✅ | ✅ | ✅ lectura | ✅ |
| ★ Comparar planes | ✅ | ✅ | ❌ | ✅ |
| ★ Prueba de Choque | ✅ token | ✅ | ✅ lectura (en el caso) | ✅ |
| Compra | registro | ✅ | ❌ | ❌ |
| Confirmación / póliza | ❌ | ✅ | ❌ | ❌ |
| Mi cuenta | ❌ | ✅ | ❌ | ❌ |
| Retoma | ✅ | ✅ | ❌ | ❌ |
| Dashboard | ❌ | ❌ | ✅ (su cola) | ✅ |
| Cola de asesoría / Caso | ❌ | ❌ | ✅ | ✅ lectura |
| Seguimiento / retención | ❌ | ❌ | ✅ | ✅ lectura |
| Catálogo y parámetros | ❌ | ❌ | ❌ | ✅ |
| Tarifas por aseguradora (tasas, pesos, rangos) | ❌ | ❌ | ❌ | ✅ |
| Simulador de tarifa | ❌ | ❌ | ❌ | ✅ |
| ★ Contenido de planes (coberturas, exclusiones, requisitos) | ❌ | ❌ | ❌ | ✅ |
| ★ Reglas de Prueba de Choque | ❌ | ❌ | ❌ | ✅ |
| Reportes | ❌ | ❌ | ✅ propio | ✅ todos |
| Usuarios / Bitácora | ❌ | ❌ | ❌ | ✅ |

> **Regla de UI**: ❌ = no aparece en el menú (oculto, no deshabilitado).

---

## 5. Campos sensibles por rol

El backend arma el DTO según el rol; el frontend pinta lo que llega y no
decide qué ocultar.

| Campo | Llega a CLIENTE | Llega a ASESOR | Llega a ADMINISTRADOR |
|---|---|---|---|
| `numeroDocumento` | Propio completo | `****5678` en listas; completo solo en caso asignado | `****5678` en listas; completo en detalle |
| `telefono`, `email` del cliente | Propio | Solo en casos de su cola | Sí |
| `descuentoMaximo` | No llega | Sí | Sí |
| `perfil.ingresoDiarioSoles` ★ | Propio | No llega | No llega (solo agregados) |
| `tokenAcceso` | Solo en la respuesta de creación | Nunca | Nunca |
| `enlaceToken` (retoma) | Nunca (va por mensaje) | Nunca | Nunca |
| `registroActividad.detalle` | No | No | Sí |
| `primas[].detalleCalculo` (desglose de la prima) | No llega | Sí (caso asignado) | Sí |
| Tasas, pesos, rangos y parámetros de plan (`/admin/tarifas/*`) | Nunca | Nunca | Sí |
| Contenido del plan: descripción, coberturas, exclusiones, requisitos (`/planes/*`) | Sí (es público, RN-46) | Sí | Sí |
| `contenidoPlan` de la orden (copia contratada) | Propio | Caso asignado | Sí |

---

## 6. Endpoints disponibles por módulo

Montos siempre como **string decimal** (`"480.00"`). Fechas ISO 8601 con
zona. Enums con los mismos valores del doc de dominio §4.2.

### Seguridad
```
POST   /auth/login
POST   /auth/registro
POST   /auth/refresh
GET    /usuarios/me
GET    /admin/usuarios
POST   /admin/usuarios                      { email, nombreCompleto, rol: 'ASESOR'|'ADMINISTRADOR' }
PATCH  /admin/usuarios/:id/rol
PATCH  /admin/usuarios/:id/estado            { activo }
```

### Cotización
```
GET    /catalogo/campos                      → { aseguradoras:[{id,nombre}], campos:[{nombre,tipo,obligatorio,origenValores,valoresPermitidos,aseguradoras:[...]}] }
GET    /catalogo/vehiculos/marcas                            → [{ id, nombre }]
GET    /catalogo/vehiculos/marcas/:marcaId/modelos           → [{ id, nombre, tipo }]
GET    /catalogo/vehiculos/modelos/:modeloId/anios           → [2026, 2025, …]   (años con al menos una aseguradora)
GET    /catalogo/ubigeos/departamentos                       → [{ departamento }]
GET    /catalogo/ubigeos/provincias?departamento=            → [{ provincia }]
GET    /catalogo/ubigeos/distritos?departamento=&provincia=  → [{ ubigeo, distrito }]
POST   /cotizaciones                         → { cotizacion, tokenAcceso, warning? }
GET    /cotizaciones/:id/resumen
PATCH  /cotizaciones/:id/aseguradoras/:aseguradoraId/suma-asegurada   { sumaAsegurada } → { primas, warning? }
PATCH  /cotizaciones/:id/cliente             vincula a la cuenta / actualiza contacto y canal
GET    /cotizaciones/mias
```
Los campos con `origenValores: "CATALOGO"` (`marca`, `modelo`, `anio`,
`ubigeo`) no traen `valoresPermitidos`: sus opciones salen de los endpoints de
catálogo de arriba y el formulario envía **ids** (`marcaId`, `modeloId`) y el
`ubigeo` de 6 dígitos. El **tipo de vehículo no se pregunta**: el backend lo
deduce del modelo.

Ejemplo de `POST /cotizaciones` (caso dorado: Toyota Corolla 2022 en Miraflores):
```json
{
  "vehiculo": { "uso": "PARTICULAR", "marcaId": "uuid-toyota", "modeloId": "uuid-corolla",
                "anio": 2022, "clase": null },
  "ubicacion": { "ubigeo": "150122" },
  "contacto": { "nombres": "Ana", "apellidos": "Ríos", "telefono": "987654321",
                "email": "ana@example.com", "canalPreferido": "WHATSAPP" }
}
```
No lleva suma asegurada: cada aseguradora arranca con el **punto medio de su
rango** redondeado a USD 100 (RN-37) y el cliente la ajusta después.

Respuesta (ilustrativa: muestra una aseguradora sin rango para el modelo-año,
RF-05; con el caso dorado real las 10 primas vienen `disponible: true`):
```json
{
  "cotizacion": {
    "id": "uuid", "estado": "REGISTRADA",
    "opciones": ["COMPRA_INMEDIATA", "ASESORIA"],
    "motivoDerivacion": null,
    "primas": [
      { "id": "uuid", "aseguradoraId": "uuid", "aseguradora": "Rímac", "planId": "uuid-plata", "plan": "Plata",
        "resumen": "Protección esencial para el uso diario", "disponible": true,
        "sumaAsegurada": "14400.00", "rangoSuma": { "minima": "12000.00", "maxima": "16800.00" },
        "prima": "439.13", "primaMensual": "36.59", "motivoNoDisponible": null },
      { "id": "uuid", "aseguradoraId": "uuid", "aseguradora": "Rímac", "planId": "uuid-oro", "plan": "Oro",
        "resumen": "Cobertura ampliada con lunas, autopartes y asistencia completa", "disponible": true,
        "sumaAsegurada": "14400.00", "rangoSuma": { "minima": "12000.00", "maxima": "16800.00" },
        "prima": "614.78", "primaMensual": "51.23", "motivoNoDisponible": null },
      { "id": "uuid", "aseguradoraId": "uuid", "aseguradora": "Qualitas", "plan": "Plus", "disponible": false,
        "sumaAsegurada": null, "rangoSuma": null, "prima": null, "primaMensual": null,
        "motivoNoDisponible": "SIN_RANGO" }
    ]
  },
  "tokenAcceso": "q3T…base64url",
  "warning": { "code": "ASEGURADORA_SIN_COTIZACION", "message": "Qualitas no pudo cotizar este vehículo; te mostramos las demás." }
}
```

| Campo de cada prima | Significado |
|---|---|
| `planId` · `resumen` ★ | Id del plan (para pedir su contenido) y su frase de venta; `resumen` llega `null` hasta que exista el contenido del plan |
| `sumaAsegurada` | Suma vigente de **esa aseguradora** (los 2 planes de una misma aseguradora comparten suma) |
| `rangoSuma` | Límites que esa aseguradora permite para este modelo y año; el control de suma del frontend usa `minima`/`maxima` |
| `prima` | Prima **anual** al contado |
| `primaMensual` | Cuota si el cliente elige 12 cuotas (RN-38); es el precio que se destaca en la tarjeta |
| `motivoNoDisponible` | `SIN_RANGO`, `PESO_FALTANTE`, `ERROR_ESTRATEGIA`, o `null` si está disponible |
| `detalleCalculo` | Desglose del cálculo; **solo** lo recibe ASESOR/ADMIN (sección 5) |

#### Ajustar la suma asegurada
```
PATCH /api/v1/cotizaciones/:id/aseguradoras/:aseguradoraId/suma-asegurada
Authorization: Bearer <JWT>   o   X-Cotizacion-Token: <tokenAcceso>
{ "sumaAsegurada": "15000.00" }
```
Respuesta (solo las primas de esa aseguradora; las demás no cambian):
```json
{
  "primas": [
    { "id": "uuid", "aseguradora": "Rímac", "plan": "Plata", "disponible": true,
      "sumaAsegurada": "15000.00", "rangoSuma": { "minima": "12000.00", "maxima": "16800.00" },
      "prima": "457.43", "primaMensual": "38.12" },
    { "id": "uuid", "aseguradora": "Rímac", "plan": "Oro", "disponible": true,
      "sumaAsegurada": "15000.00", "rangoSuma": { "minima": "12000.00", "maxima": "16800.00" },
      "prima": "640.40", "primaMensual": "53.37" }
  ],
  "warning": { "code": "SIMULACION_DESACTUALIZADA", "message": "Cambiaste tu suma asegurada; vuelve a simular para ver tus costos reales." }
}
```
- `warning` solo aparece si la cotización tenía una Prueba de Choque vigente;
  esa simulación pasa a `vigente: false`.
- Suma fuera de rango → `400` con el rango en el mensaje:
  ```json
  { "statusCode": 400,
    "message": "La suma asegurada de Rímac debe estar entre USD 12,000.00 y USD 16,800.00",
    "errors": [ { "campo": "sumaAsegurada", "mensaje": "Fuera del rango permitido (12000.00 – 16800.00)" } ],
    "correlationId": "uuid", "timestamp": "…", "path": "…" }
  ```
- Si la cotización ya está `CONVERTIDA` o ya tiene orden de compra → `409`
  ("Ya iniciaste tu compra: la suma asegurada ya no se puede cambiar.").
- El frontend **no calcula** la prima nueva: pinta lo que devuelve este endpoint.

### ★ Contenido del plan (qué cubre, qué no cubre, requisitos)
```
GET    /planes/:planId/contenido              detalle completo de un plan
GET    /planes/comparar?ids=a,b,c             matriz cobertura × plan (2 a 3 planes)
```
No requieren JWT ni token: es información pública y no afecta la prima. El
frontend **no ordena ni deduce nada**: pinta lo que llega.

Respuesta de `GET /planes/:planId/contenido` (Rímac · Oro, abreviada):
```json
{
  "planId": "uuid-oro", "aseguradora": "Rímac", "plan": "Oro",
  "resumen": "Cobertura ampliada con lunas, autopartes y asistencia completa",
  "descripcion": "Todo lo de Plata más lunas, autopartes, chofer y vehículo de reemplazo, asistencia legal y países vecinos, con límites más altos.",
  "idealPara": "Quien no quiere quedarse sin auto ni preocuparse por trámites",
  "coberturas": [
    { "codigo": "DANO_CHOQUE", "nombre": "Daño propio por choque o vuelco", "categoria": "DANOS_PROPIOS",
      "incluida": true, "detalle": null, "limiteMonto": null },
    { "codigo": "RC_TERCEROS", "nombre": "Responsabilidad civil frente a terceros", "categoria": "RESPONSABILIDAD",
      "incluida": true, "detalle": "Hasta USD 200,000", "limiteMonto": "200000.00" }
  ],
  "exclusiones": [
    "Conducir con alcohol sobre el límite legal o bajo efectos de drogas",
    "Daños a mercadería o carga transportada"
  ],
  "requisitos": [
    { "tipo": "VEHICULO",  "texto": "Vehículo del año 2015 al 2026 (antigüedad máxima 12 años)", "obligatorio": true },
    { "tipo": "CONDUCTOR", "texto": "Conductor habitual con licencia vigente y mayor de 21 años", "obligatorio": true }
  ],
  "leyenda": "Contenido ilustrativo; no es el condicionado de la aseguradora."
}
```
- `coberturas` trae **siempre las 13 del catálogo**, en el mismo orden para todos
  los planes. "Qué no cubre" en pantalla = las de `incluida: false` + `exclusiones`.
- `requisitos` informan; **no** bloquean la cotización ni la compra (RN-44). Lo
  que bloquea llega como error 400/422 del endpoint correspondiente.

Respuesta de `GET /planes/comparar?ids=…` (dos planes, abreviada):
```json
{
  "planes": [
    { "planId": "uuid-plata", "aseguradora": "Rímac", "plan": "Plata", "resumen": "…" },
    { "planId": "uuid-oro",   "aseguradora": "Rímac", "plan": "Oro",   "resumen": "…" }
  ],
  "filas": [
    { "codigo": "LUNAS", "nombre": "Rotura de lunas", "categoria": "DANOS_PROPIOS",
      "valores": [ { "incluida": false, "detalle": null }, { "incluida": true, "detalle": null } ] },
    { "codigo": "RC_TERCEROS", "nombre": "Responsabilidad civil frente a terceros", "categoria": "RESPONSABILIDAD",
      "valores": [ { "incluida": true, "detalle": "Hasta USD 100,000" }, { "incluida": true, "detalle": "Hasta USD 200,000" } ] }
  ]
}
```
`valores[i]` corresponde a `planes[i]`. Más de 3 ids → `400` `COMPARAR_MAXIMO_3`.

**Qué se congela al comprar**: `POST /compras` no recibe contenido; el backend
guarda en la orden una copia del contenido del plan en ese momento (RN-45) y
la póliza PDF se genera desde ella. `GET /compras/:id/estado` y
`GET /polizas/mias` incluyen `contenidoPlan` (misma forma que arriba, más
`congeladoEn`) para mostrar "lo que contrataste". Si el plan quedara con
contenido incompleto, `POST /compras` responde `409 CONTENIDO_PLAN_INCOMPLETO`.

### ★ Prueba de Choque
```
GET    /prueba-choque/escenarios?uso=PARTICULAR
POST   /cotizaciones/:id/prueba-choque
GET    /cotizaciones/:id/prueba-choque               última simulación (404 si no hay)
GET    /cotizaciones/:id/prueba-choque/pdf           resumen de 1 página (application/pdf)
POST   /prueba-choque/clasificar                     opcional (flag) { texto } → { escenarios[], perfil }
```
Request:
```json
{ "perfil": { "estacionaCochera": false, "kmMesAlto": true, "usoNocturno": false,
              "ingresoDiarioSoles": null, "preocupaciones": ["ROBO_AUTOPARTES"] } }
```
Respuesta:
```json
{
  "simulacion": {
    "id": "uuid", "zona": "ALTA", "moneda": "USD", "vigente": true,
    "ranking": [
      { "primaCotizadaId": "uuid", "aseguradora": "Pacífico", "plan": "Premium",
        "prima": "560.00", "desembolsoEsperado": "96.40", "costoRealAnual": "656.40",
        "peorCaso": "1250.00", "datosCompletos": true, "posicion": 1 }
    ],
    "matriz": [
      { "escenario": { "codigo": "ROBO_AUTOPARTES", "nombre": "Te roban espejos o faros", "probabilidad": "0.1800" },
        "resultados": [
          { "primaCotizadaId": "uuid", "cubre": true, "deducible": "150.00", "noCubierto": "0.00",
            "ingresoPerdido": "0.00", "desembolso": "150.00", "sinDato": false }
        ] }
    ],
    "leyenda": "Estimación referencial basada en condiciones resumidas. Prevalece el condicionado de la aseguradora."
  },
  "warning": { "code": "DATOS_COBERTURA_INCOMPLETOS", "message": "No tenemos información de robo total para 1 plan." }
}
```

### Compra
```
GET    /compras/resumen?cotizacionId=&primaCotizadaId=
GET    /compras/:cotizacionId/campos-faltantes      → solo lo no capturado (numeroDocumento, placa…)
PUT    /compras/:cotizacionId/datos
POST   /compras                                      { cotizacionId, primaCotizadaId, aceptaCondiciones, firmaSimulada, origen?: 'RETOMA' }
POST   /compras/:id/pago                             { modo: 'UNICO'|'CUOTAS', numeroCuotas? }  + Idempotency-Key
GET    /compras/:id/estado
```

Montos de la compra (los calcula el backend con la regla de la aseguradora,
RN-38; el frontend solo los muestra). Ejemplo de `GET /compras/resumen` para La
Positiva · Full con descuento de primera compra:
```json
{
  "aseguradora": "La Positiva", "plan": "Full", "sumaAsegurada": "15000.00",
  "primaAnual": "651.79",
  "descuento": { "tipo": "PRIMERA_COMPRA", "porcentaje": "5.00" },
  "primaFinal": "619.20",
  "pago": {
    "UNICO":  { "total": "619.20" },
    "CUOTAS": { "numeroCuotas": 12, "total": "650.16", "cuotaMensual": "54.18", "recargoPorcentaje": "5.00" }
  }
}
```
`POST /compras/:id/pago` responde `{ compra: { estado, polizaId, montoTotal,
cuotas[] }, warning? }`; `montoTotal` es lo que se cobró (en `CUOTAS` puede
superar `primaFinal` si la aseguradora recarga el fraccionamiento).

### Pólizas
```
GET    /polizas/mias
GET    /polizas/:id/pdf                              application/pdf (o 202 + warning si aún se genera)
```

### Asesoría y retención
```
POST   /asesorias                                    CLIENTE { cotizacionId, motivo: 'DUDA'|'NEGOCIACION'|'DESCUENTO', canal }
GET    /asesorias/cola?estado=&origen=               ASESOR
GET    /asesorias/:id
POST   /asesorias/:id/tomar                          409 si ya fue tomada
POST   /asesorias/:id/descuentos                     { planId, porcentaje }
POST   /asesorias/:id/resultado                      { resultado, acepta }
GET    /seguimientos?estado=
GET    /seguimientos/:id
POST   /seguimientos/:id/intentos                    { canal, resultado }
POST   /seguimientos/:id/aceptacion                  cliente aceptó por teléfono → reenvía enlace de compra
POST   /seguimientos/:id/cierre                      { estado: 'CONVERTIDO'|'DESCARTADO', motivo }
GET    /retoma/:token                                público → { cotizacionId, tokenAcceso, descuento }
```

### Administración
```
GET    /admin/panel
GET    /admin/aseguradoras          PATCH /admin/aseguradoras/:id      { activa }
GET    /admin/planes                POST /admin/planes                 PATCH /admin/planes/:id
GET    /admin/campos                POST /admin/campos   PUT /admin/campos/:id   DELETE /admin/campos/:id
GET    /admin/reglas-inspeccion     PUT  /admin/reglas-inspeccion
GET    /admin/parametros            PUT  /admin/parametros
GET    /admin/tarifas/planes?aseguradoraId=              → [{ planId, plan, tasaBase, parametros }]
PUT    /admin/tarifas/planes/:planId                     { tasaBase, parametros }      (valida `parametros` con el zod de la Estrategia)
GET    /admin/tarifas/pesos/:tabla?aseguradoraId=        :tabla ∈ marca | modelo | anio | tipo | ubigeo
PUT    /admin/tarifas/pesos/:tabla                       { aseguradoraId, filas:[{ clave, peso }] }   (carga masiva)
GET    /admin/tarifas/rangos-suma?aseguradoraId=&marcaId=&modeloId=
PUT    /admin/tarifas/rangos-suma                        { aseguradoraId, filas:[{ modeloId, anio, sumaMinima, sumaMaxima }] }
POST   /admin/tarifas/simular                            { modeloId, anio, ubigeo, sumaAsegurada? } → por aseguradora y plan: prima, primaMensual, detalleCalculo
GET    /admin/tarifas/completitud?aseguradoraId=         → modelos-año sin rango o con pesos faltantes
★ GET    /admin/planes/:planId/contenido      contenido completo + advertencias (RN-42/43)
★ PUT    /admin/planes/:planId/contenido      { resumen, descripcion, idealPara, coberturas:[{ codigo, incluida, detalle?, limiteMonto? }], exclusiones:[texto], requisitos:[{ tipo, texto, obligatorio }] }   (reemplaza todo en una transacción)
★ GET    /admin/coberturas            POST /admin/coberturas   PUT /admin/coberturas/:id   (catálogo común de 13 coberturas)
★ GET    /admin/contenido-planes/completitud   → por plan: coberturasFaltantes, incoherenciasPruebaChoque, completo
GET    /admin/bitacora?entidad=&desde=&hasta=
★ GET|PUT /admin/prueba-choque/escenarios
★ GET|PUT /admin/prueba-choque/coberturas?planId=
★ GET|PUT /admin/prueba-choque/frecuencias
★ GET|PUT /admin/prueba-choque/zonas
★ GET|PUT /admin/prueba-choque/factores
```
> `DELETE /admin/campos/:id` desactiva el campo (RN-16); solo
> `valor_permitido` se borra físicamente.
>
> `PUT /admin/planes/:planId/contenido` **reemplaza** coberturas, exclusiones y
> requisitos del plan (no los desactiva fila por fila: cada orden guarda su
> propia copia, RN-45). Debe traer **las 13 coberturas** o responde `400
> COBERTURA_FALTANTE` (RN-42). `PATCH /admin/planes/:id { activo: true }`
> responde `400 CONTENIDO_INCOMPLETO` si el plan no está completo.

### Reportes (JSON; `?formato=pdf` para descargar)
```
GET    /admin/reportes/ventas?desde=&hasta=&agrupar=canal|aseguradora|plan
GET    /admin/reportes/retencion?desde=&hasta=
GET    /admin/reportes/descuentos?desde=&hasta=
★ GET  /admin/reportes/prueba-choque?desde=&hasta=
GET    /asesor/reportes/mi-desempeno?desde=&hasta=
```

---

## 7. Descarga de PDFs

`Content-Type: application/pdf` y `Content-Disposition: attachment;
filename="poliza-<numero>.pdf"`. El backend sirve el archivo desde Storage
(bucket privado); el frontend nunca recibe una URL pública permanente.

```ts
const res = await api.get(`polizas/${polizaId}/pdf`);           // ky con Bearer
if (res.status === 202) { /* warning PDF_EN_GENERACION → reintentar en 3 s */ }
const blob = await res.blob();
const url = URL.createObjectURL(blob);
const a = Object.assign(document.createElement('a'), { href: url, download: `poliza-${numero}.pdf` });
a.click(); URL.revokeObjectURL(url);
```

---

## 8. Manejo de errores del backend

```json
{
  "statusCode": 400,
  "message": "Pacífico necesita el distrito para cotizarte",
  "errors": [ { "campo": "distrito", "mensaje": "Es obligatorio para Pacífico" } ],
  "correlationId": "uuid-de-la-request",
  "timestamp": "2026-11-08T05:42:00.000Z",
  "path": "/api/v1/cotizaciones"
}
```
`errors` solo aparece en validación de formulario (RF-03).

| Código | Cuándo |
|---|---|
| `400` | Validación o regla de negocio (incluye `RAISE EXCEPTION` de un RPC; p. ej. suma asegurada fuera de rango, `COBERTURA_FALTANTE`, `CONTENIDO_INCOMPLETO`, `COMPARAR_MAXIMO_3`) |
| `401` | Sin JWT / token de cotización, o expirado |
| `403` | Rol sin permiso o usuario desactivado |
| `404` | Recurso inexistente o ajeno (no se distingue, para no filtrar existencia) |
| `409` | Conflicto: caso ya tomado, pago ya confirmado, cotización ya convertida o con compra en curso (no se puede cambiar la suma), `CONTENIDO_PLAN_INCOMPLETO` al comprar |
| `422` | Fuera de nicho (RN-05) |
| `429` | Rate limit (flujo público: 20/min por IP) |
| `500` | Error interno (mensaje genérico + `correlationId`) |

---

## 9. Advertencias no bloqueantes (`warning`)

La operación **sí** se ejecutó. El frontend muestra `warning.message` en un
toast ámbar sin bloquear.

| Endpoint | `warning.code` | Cuándo |
|---|---|---|
| `POST /cotizaciones` | `ASEGURADORA_SIN_COTIZACION` | Al menos una aseguradora no devolvió prima (RF-05) |
| `POST /cotizaciones/:id/prueba-choque` ★ | `DATOS_COBERTURA_INCOMPLETOS` | Algún plan sin regla para un escenario (RN-30) |
| `POST /compras/:id/pago` | `PDF_EN_GENERACION` | La compra se confirmó pero el PDF aún no está listo |
| `PUT /admin/planes/:planId/contenido` ★ | `CONTENIDO_INCOHERENTE` | Una cobertura del plan contradice a la Prueba de Choque (RN-43); se guarda igual |
| `PATCH /cotizaciones/:id/aseguradoras/:aseguradoraId/suma-asegurada` | `SIMULACION_DESACTUALIZADA` | La suma cambió y la cotización tenía una Prueba de Choque vigente (RN-37) |

---

## 10. Supabase — variables del frontend

```
VITE_SUPABASE_URL=https://[proyecto].supabase.co
VITE_SUPABASE_ANON_KEY=[anon-key]
VITE_API_URL=https://[backend]/api/v1
```
La `SERVICE_ROLE_KEY` y el `JWT_SECRET` **nunca** van al frontend. El
frontend no consulta tablas por PostgREST: aunque el esquema `svas` esté
expuesto para el backend, RLS lo protege y `anon` no tiene grants.

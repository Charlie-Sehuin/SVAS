# Propuesta — Panel del cliente (`/mi-cuenta`)

> Estado: **propuesta, sin construir**. Fecha: 2026-11-22.
> Hoy `/mi-cuenta` solo tiene "Mis cotizaciones" y "Mis pólizas".

## 1. Qué hay hoy en el backend (verificado en el código)

| Necesidad | ¿Existe? | Detalle |
|---|---|---|
| Listar mis pólizas / cotizaciones | Sí | `GET /polizas/mias`, "Mis cotizaciones" |
| Cuotas con fecha de vencimiento | Sí, solo en base | tabla `svas.cuota` (`fecha_vencimiento`, `numero`, `monto`); la cuota 1 se cobra al comprar y las demás quedan pendientes |
| **Pagar una cuota pendiente** | **No** | `POST /compras/:id/pago` solo cubre el pago inicial |
| Vigencia / fecha de fin de póliza | **No** | `poliza` tiene `fecha_emision`, no inicio ni fin de vigencia |
| Ver mi contacto | Sí | `GET /usuarios/me/contacto` |
| **Editar mi contacto** | **No** | no hay `PATCH` |
| Cambiar contraseña | Sí | desde el menú de cuenta |
| **Recuperar contraseña** | **No** | ni backend ni pantalla "Olvidé mi contraseña" |
| Mis asesorías y seguimientos (lado cliente) | **No** | las rutas existentes son del asesor (`cola`, `tomar`, `intentos`…) |
| Mis vehículos | **No** | el vehículo se guarda dentro de cada cotización |

## 2. Propuesta por fases (de más valor a menos riesgo)

### Fase A — Inicio del panel + recuperar contraseña (**construida el 2026-11-22**, ver `estado-implementacion.md`; la "próxima cuota" pasó a la Fase B)
- **Inicio `/mi-cuenta`**: tarjetas de resumen (pólizas activas, próxima cuota con su fecha, cotizaciones abiertas) y accesos directos. Solo lectura, arma todo con endpoints que ya existen más uno nuevo de cuotas (ver B).
- **Recuperar contraseña**: Supabase Auth ya lo soporta (`resetPasswordForEmail`). Faltan la pantalla "Olvidé mi contraseña" y la de "Nueva contraseña". Casi no toca el backend. **Depende de tener correo real** (ver §4).

### Fase B — Pagar cuotas desde el panel (**construida el 2026-11-22; la migración 0041 está probada y aplicada en producción**; ver `estado-implementacion.md`)
- Backend: `GET /polizas/:id/cuotas` y `POST /cuotas/:id/pago`, con `Idempotency-Key`, mismo patrón que el pago inicial. La pasarela sigue **simulada**, como el resto.
- Frontend: en "Mis pólizas", cronograma con estado de cada cuota (en texto, no solo color), botón "Pagar cuota N" y la próxima cuota resaltada en el Inicio.
- Reglas a decidir: ¿se puede pagar una cuota adelantada? ¿qué pasa con una vencida (mora, aviso, nada)? Hoy el dominio no las define.

### Fase C — Perfil y datos
- `PATCH /usuarios/me/contacto` (teléfono, correo, canal preferido), con las mismas validaciones del registro.
- Cambiar el correo debe pasar por Supabase Auth (confirmación), no solo por la tabla de contacto.
- Pantalla `/mi-cuenta/perfil`.

### Fase D — Asesorías y seguimientos del cliente (**construida el 2026-11-22**; sin nombre del asesor ni nota de cierre, ver `estado-implementacion.md`)
- `GET /asesorias/mias` (estado, motivo, asesor asignado por nombre, descuento vigente, fecha). El cliente **no** ve datos internos del asesor ni la cola.
- Pantalla `/mi-cuenta/asesorias` con estado en texto y enlace a la cotización.

### Fase E — Renovación y recordatorios (la más grande)
- Requiere **primero definir la vigencia**: agregar inicio y fin de vigencia a la póliza (migración nueva) y decidir si es anual fija.
- Con eso: etiqueta "vence en N días" en Mis pólizas y botón "Renovar" que abre una cotización nueva con los mismos datos.
- Los **recordatorios por correo/WhatsApp** son un job aparte (como el detector de abandonadas) y salen por el puerto `NotificadorMensajes`, que hoy es simulado. Sin canal real, solo habría aviso dentro del panel.

### Fase F — Mis vehículos
- Lo más barato: **derivarlos** de las cotizaciones y pólizas del cliente (marca, modelo, año, placa) y ofrecerlos como "Usar este auto" en `/cotizar`. Sin tabla nueva.
- Una tabla propia (`vehiculo_cliente`) solo si se quiere editar o borrar autos a mano. No lo recomiendo al inicio.

## 3. Orden sugerido y tamaño

| Fase | Backend | Frontend | Migración | Riesgo |
|---|---|---|---|---|
| A. Inicio + recuperar clave | mínimo | medio | no | bajo (necesita correo) |
| B. Pagar cuotas | medio | medio | probable (RPC) | medio (reglas de mora) |
| C. Perfil | pequeño | pequeño | no | bajo |
| D. Mis asesorías | pequeño | pequeño | no | bajo |
| F. Mis vehículos | ninguno | pequeño | no | bajo |
| E. Renovación | medio | medio | **sí** | alto (decisión de producto) |

Recomiendo **A → C → B → D → F → E**. E queda al final porque necesita decisiones que hoy no existen.

## 4. Decisiones que necesito de ti

1. **Correo real**: la recuperación de contraseña (y los recordatorios) necesitan enviar a clientes. Resend sin dominio propio solo entrega a la cuenta dueña de la clave. ¿Hay dominio para verificar?
2. **Cuotas vencidas**: ¿solo se avisa, o hay recargo o bloqueo? ¿se permite pagar por adelantado?
3. **Vigencia**: ¿las pólizas duran 12 meses desde la emisión? ¿"Renovar" significa recotizar o renovar al mismo precio?
4. **Alcance de la primera entrega**: ¿una fase por rama y PR, o varias juntas?

## 5. Cómo se trabajaría
- Un PR por fase y por repo (backend primero, luego frontend), siguiendo la guía de equipo.
- Pruebas: unitarias y e2e en el backend; MSW en el frontend. Cualquier migración se prueba con `begin … rollback` antes de aplicarla.
- Todo lo que toque dinero lo calcula el backend; el frontend no suma ni divide.
- Pago, emisión y mensajes siguen **simulados**, con el aviso visible en pantalla.

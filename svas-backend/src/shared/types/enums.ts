/**
 * Espejo de los 19 enums de Postgres (migración 0001, doc contexto §4.2).
 * Si cambia un enum en la base, se cambia aquí en la misma PR.
 */
const e = <const T extends readonly string[]>(...valores: T) => valores;

export const ROL = e('CLIENTE', 'ASESOR', 'ADMINISTRADOR');
export const USO_VEHICULO = e(
  'PARTICULAR',
  'COMERCIAL_LIGERO',
  'TRANSPORTE_PASAJEROS',
);
export const CANAL_CONTACTO = e('LLAMADA', 'WHATSAPP');
export const ESTADO_COTIZACION = e('REGISTRADA', 'CONVERTIDA', 'NO_CONCRETADA');
export const OPCION_VENTA = e('COMPRA_INMEDIATA', 'ASESORIA');
export const MOTIVO_ASESORIA = e(
  'DUDA',
  'NEGOCIACION',
  'DESCUENTO',
  'INSPECCION',
  'NO_ASEGURABLE',
);
export const ORIGEN_CASO = e('SISTEMA', 'CLIENTE');
export const ESTADO_SOLICITUD = e('PENDIENTE', 'EN_ATENCION', 'CERRADA');
export const TIPO_DESCUENTO = e('PRIMERA_COMPRA', 'NEGOCIADO');
export const ESTADO_SEGUIMIENTO = e(
  'EN_SEGUIMIENTO',
  'CONVERTIDO',
  'DESCARTADO',
);
export const MOTIVO_CIERRE = e(
  'PRECIO',
  'YA_CONTRATO',
  'NO_RESPONDE',
  'SIN_INTERES',
  'OTRO',
);
export const RESULTADO_INTENTO = e(
  'CONTACTADO',
  'NO_RESPONDE',
  'RECHAZA',
  'ACEPTA',
);
export const MODO_PAGO = e('UNICO', 'CUOTAS');
export const ESTADO_PAGO = e('PENDIENTE', 'CONFIRMADO', 'RECHAZADO');
export const CANAL_VENTA = e('AUTONOMO', 'ASESORIA', 'TELEMARKETING');
export const TIPO_CAMPO = e('TEXTO', 'NUMERO', 'LISTA');
export const ZONA_RIESGO = e('ALTA', 'MEDIA', 'BAJA');
export const CONDICION_TALLER = e('AFILIADO', 'CUALQUIERA');
export const VARIABLE_PERFIL = e(
  'ESTACIONA_COCHERA',
  'KM_MES_ALTO',
  'USO_NOCTURNO',
);

export type Rol = (typeof ROL)[number];
export type UsoVehiculo = (typeof USO_VEHICULO)[number];
export type CanalContacto = (typeof CANAL_CONTACTO)[number];
export type EstadoCotizacion = (typeof ESTADO_COTIZACION)[number];
export type OpcionVenta = (typeof OPCION_VENTA)[number];
export type MotivoAsesoria = (typeof MOTIVO_ASESORIA)[number];
export type OrigenCaso = (typeof ORIGEN_CASO)[number];
export type EstadoSolicitud = (typeof ESTADO_SOLICITUD)[number];
export type TipoDescuento = (typeof TIPO_DESCUENTO)[number];
export type EstadoSeguimiento = (typeof ESTADO_SEGUIMIENTO)[number];
export type MotivoCierre = (typeof MOTIVO_CIERRE)[number];
export type ResultadoIntento = (typeof RESULTADO_INTENTO)[number];
export type ModoPago = (typeof MODO_PAGO)[number];
export type EstadoPago = (typeof ESTADO_PAGO)[number];
export type CanalVenta = (typeof CANAL_VENTA)[number];
export type TipoCampo = (typeof TIPO_CAMPO)[number];
export type ZonaRiesgo = (typeof ZONA_RIESGO)[number];
export type CondicionTaller = (typeof CONDICION_TALLER)[number];
export type VariablePerfil = (typeof VARIABLE_PERFIL)[number];

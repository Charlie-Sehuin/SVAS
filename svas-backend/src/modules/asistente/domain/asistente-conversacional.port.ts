import type { MensajeChat } from './asistente';

/** Lo que se le entrega al proveedor de IA en cada turno. */
export interface EntradaAsistente {
  /** Reglas + planes (y precios, si hay cotización). Lo arma el dominio. */
  instrucciones: string;
  /** La conversación, del mensaje más viejo al más nuevo. */
  mensajes: MensajeChat[];
  /** Las únicas claves de plan que puede recomendar (P1, P2…). */
  clavesPlanes: string[];
}

/** Lo que el proveedor contesta; todavía sin validar (el dominio lo filtra). */
export interface RespuestaCruda {
  respuesta: string;
  planes: { clave: string; motivo: string }[];
  acciones: string[];
}

/**
 * Puerto del chatbot: el proveedor de IA (Gemini hoy) queda detrás de esta
 * interfaz. El adaptador vive en `integracion/asistente/`.
 */
export interface AsistenteConversacional {
  responder(entrada: EntradaAsistente): Promise<RespuestaCruda>;
}

export const ASISTENTE_CONVERSACIONAL = Symbol('ASISTENTE_CONVERSACIONAL');

export interface AdjuntoCorreo {
  nombre: string;
  contenido: Buffer;
  /** Tipo MIME, p. ej. application/pdf. */
  tipo: string;
}

export interface CorreoSaliente {
  para: string;
  asunto: string;
  texto: string;
  html?: string;
  adjuntos?: AdjuntoCorreo[];
  /** Si el proveedor la admite, repetir el mismo envío no manda un segundo correo. */
  claveIdempotencia?: string;
}

/**
 * Puerto · Correo al cliente (p. ej. la póliza en PDF). Sin RESEND_API_KEY el
 * adaptador es el simulado (solo registra); con ella, Resend envía de verdad.
 * Lanza si el proveedor rechaza el envío: quien lo llama decide qué hacer.
 */
export interface EnviadorCorreo {
  enviar(c: CorreoSaliente): Promise<{ enviado: boolean; referencia?: string }>;
}

export const ENVIADOR_CORREO = Symbol('ENVIADOR_CORREO');

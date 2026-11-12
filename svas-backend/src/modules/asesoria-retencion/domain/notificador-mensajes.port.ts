import type { CanalContacto } from '../../../shared/types/enums';

/**
 * Puerto 5/6 · Mensajes al cliente (arquitectura backend §3.6.4). Hoy simulado
 * (solo registra); siguiente paso recomendado: WhatsApp Business API (§11).
 */
export interface NotificadorMensajes {
  enviar(i: {
    canal: CanalContacto;
    destinatario: string; // teléfono o email según el canal
    texto: string;
  }): Promise<{ enviado: boolean; referencia?: string }>;
}

export const NOTIFICADOR_MENSAJES = Symbol('NOTIFICADOR_MENSAJES');

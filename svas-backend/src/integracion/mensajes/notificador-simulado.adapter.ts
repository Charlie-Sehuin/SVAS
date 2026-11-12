import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { enmascarar } from '../../common/utils/mask.util';
import type { Env } from '../../config/env.validation';
import type { NotificadorMensajes } from '../../modules/asesoria-retencion/domain/notificador-mensajes.port';

/** Oculta el token de los enlaces de retoma: es una credencial de un solo uso. */
export function ocultarEnlaces(texto: string): string {
  return texto.replace(/\/retoma\/[A-Za-z0-9_-]+/g, '/retoma/***');
}

/**
 * Mensajes simulados (arquitectura backend §3.6.4): no envía nada, solo
 * registra en el log. Fuera de producción muestra el texto completo (con el
 * enlace) para poder probar la retoma; en producción oculta el token.
 * Siguiente paso: WhatsApp Business API (§11).
 */
@Injectable()
export class NotificadorSimuladoAdapter implements NotificadorMensajes {
  private readonly logger = new Logger('NotificadorSimulado');
  private readonly mostrarEnlace: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.mostrarEnlace =
      config.get('NODE_ENV', { infer: true }) !== 'production';
  }

  enviar(i: Parameters<NotificadorMensajes['enviar']>[0]) {
    const referencia = `SIM-${randomUUID()}`;
    const texto = this.mostrarEnlace ? i.texto : ocultarEnlaces(i.texto);
    this.logger.log(
      `[${referencia}] ${i.canal} a ${enmascarar(i.destinatario) ?? '(sin destinatario)'}: ${texto}`,
    );
    return Promise.resolve({ enviado: true, referencia });
  }
}

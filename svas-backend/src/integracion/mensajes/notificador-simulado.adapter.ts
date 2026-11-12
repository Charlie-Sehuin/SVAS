import { Injectable } from '@nestjs/common';
import type { NotificadorMensajes } from '../../modules/asesoria-retencion/domain/notificador-mensajes.port';
import { noImplementado } from '../no-implementado';

/** PENDIENTE (Ola 2): registra el mensaje en el log en lugar de enviarlo. */
@Injectable()
export class NotificadorSimuladoAdapter implements NotificadorMensajes {
  enviar(): ReturnType<NotificadorMensajes['enviar']> {
    return noImplementado('NotificadorSimulado', 'Ola 2');
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.validation';
import type { AvisoCliente } from '../domain/asesoria.repository.port';
import {
  mensajeEnlaceCompra,
  mensajeFinal,
  urlRetoma,
} from '../domain/mensajes';
import {
  NOTIFICADOR_MENSAJES,
  type NotificadorMensajes,
} from '../domain/notificador-mensajes.port';
import { GenerarResumenRetencionUseCase } from './generar-resumen-retencion.use-case';

/** El cambio ya quedó guardado; solo falló el mensaje (doc conexión §9). */
export interface WarningMensaje {
  code: 'MENSAJE_NO_ENVIADO';
  message: string;
}

export const WARNING_MENSAJE_NO_ENVIADO: WarningMensaje = {
  code: 'MENSAJE_NO_ENVIADO',
  message: 'Se guardó el cambio, pero no pudimos enviar el mensaje al cliente.',
};

/**
 * Envía al cliente el enlace de retoma por su canal preferido. Un fallo del
 * notificador NO revierte el cambio (el RPC ya confirmó): devuelve un warning.
 */
@Injectable()
export class AvisoClienteService {
  private readonly logger = new Logger(AvisoClienteService.name);
  private readonly frontendUrl: string;

  constructor(
    @Inject(NOTIFICADOR_MENSAJES)
    private readonly notificador: NotificadorMensajes,
    config: ConfigService<Env, true>,
    private readonly resumen: GenerarResumenRetencionUseCase,
  ) {
    this.frontendUrl = config.get('FRONTEND_URL', { infer: true });
  }

  async enviar(
    aviso: AvisoCliente,
    tipo: 'ENLACE_COMPRA' | 'MENSAJE_FINAL',
  ): Promise<WarningMensaje | undefined> {
    if (!aviso.enlaceToken) return undefined;
    const url = urlRetoma(this.frontendUrl, aviso.enlaceToken);
    const contraste =
      tipo === 'MENSAJE_FINAL'
        ? await this.resumen.frase(aviso.cotizacionId)
        : null;
    const texto =
      tipo === 'ENLACE_COMPRA'
        ? mensajeEnlaceCompra(aviso.nombres, url)
        : mensajeFinal(aviso.nombres, url, contraste);
    try {
      // Los dos canales (LLAMADA y WHATSAPP) llegan al celular.
      const r = await this.notificador.enviar({
        canal: aviso.canal,
        destinatario: aviso.telefono,
        texto,
      });
      if (r.enviado) {
        if (tipo === 'MENSAJE_FINAL') {
          await this.resumen.registrarEnvio(
            aviso.seguimientoId,
            contraste !== null,
          );
        }
        return undefined;
      }
    } catch (e) {
      this.logger.error(
        `Falló el notificador (seguimiento ${aviso.seguimientoId}): ${(e as Error).message}`,
      );
    }
    this.logger.warn(
      `Mensaje ${tipo} no enviado (seguimiento ${aviso.seguimientoId})`,
    );
    return WARNING_MENSAJE_NO_ENVIADO;
  }
}

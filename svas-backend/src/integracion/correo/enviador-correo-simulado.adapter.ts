import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { enmascararEmail } from '../../common/utils/mask.util';
import type {
  CorreoSaliente,
  EnviadorCorreo,
} from '../../modules/polizas/domain/enviador-correo.port';

/** Correo simulado: no envía nada, solo registra (sin el texto ni el correo completo). Se usa sin RESEND_API_KEY. */
export class EnviadorCorreoSimuladoAdapter implements EnviadorCorreo {
  private readonly logger = new Logger('EnviadorCorreoSimulado');

  enviar(c: CorreoSaliente) {
    const referencia = `SIM-${randomUUID()}`;
    const adjuntos =
      c.adjuntos?.map((a) => a.nombre).join(', ') || 'sin adjuntos';
    this.logger.log(
      `[${referencia}] correo a ${enmascararEmail(c.para) ?? '(sin destinatario)'}: "${c.asunto}" (${adjuntos})`,
    );
    return Promise.resolve({ enviado: true, referencia });
  }
}

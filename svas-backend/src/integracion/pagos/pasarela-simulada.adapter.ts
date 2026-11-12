import { Injectable } from '@nestjs/common';
import type { PasarelaPago } from '../../modules/pagos/domain/pasarela-pago.port';
import { noImplementado } from '../no-implementado';

/**
 * PENDIENTE (Ola 3). Comportamiento acordado (arquitectura backend §4.5):
 * rechaza determinísticamente montos terminados en .13 (para probar el
 * rechazo en E2E); el resto aprueba. Idempotente por idempotencyKey.
 */
@Injectable()
export class PasarelaSimuladaAdapter implements PasarelaPago {
  cobrar(): ReturnType<PasarelaPago['cobrar']> {
    return noImplementado('PasarelaSimulada', 'Ola 3');
  }
}

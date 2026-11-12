import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { redondear } from '../../common/utils/money.util';
import type { PasarelaPago } from '../../modules/pagos/domain/pasarela-pago.port';

/** Montos que la pasarela simulada rechaza: los que terminan en .13 (arquitectura backend §4.5). */
export const CENTAVOS_RECHAZO = '13';

/**
 * Pasarela de demostración: no cobra nada. Rechaza determinísticamente los
 * montos terminados en .13 (para probar el rechazo) y aprueba el resto.
 *
 * Idempotente sin guardar estado en memoria (backend §1): la referencia sale
 * del hash de (ordenId, idempotencyKey), así que repetir la misma llamada da
 * el mismo resultado y la misma referencia.
 */
@Injectable()
export class PasarelaSimuladaAdapter implements PasarelaPago {
  cobrar(
    i: Parameters<PasarelaPago['cobrar']>[0],
  ): ReturnType<PasarelaPago['cobrar']> {
    const monto = redondear(i.monto);
    if (monto.lte(0)) {
      return Promise.reject(
        new Error('La pasarela solo acepta montos mayores a 0'),
      );
    }
    const centavos = monto.toFixed(2).slice(-2);
    const huella = createHash('sha256')
      .update(`${i.ordenId}:${i.idempotencyKey}`)
      .digest('hex')
      .slice(0, 20)
      .toUpperCase();
    return Promise.resolve({
      estado: centavos === CENTAVOS_RECHAZO ? 'RECHAZADO' : 'APROBADO',
      referencia: `SIM-${huella}`,
    });
  }
}

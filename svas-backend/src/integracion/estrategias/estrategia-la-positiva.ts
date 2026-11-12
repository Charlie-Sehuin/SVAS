import { z } from 'zod';
import type { PesoNombre } from '../../modules/cotizacion/domain/tarifa.types';
import { EstrategiaBase } from './estrategia-base';

/** La Positiva: … × wTipo; cuotas con recargo (override totalEnCuotas) (doc contexto §17.5). PENDIENTE (Ola 1): fórmula. */
export class EstrategiaLaPositiva extends EstrategiaBase {
  readonly codigo = 'LA_POSITIVA' as const;
  override readonly parametrosSchema = z
    .object({
      recargo_pago_mensual: z
        .number({
          error: 'recargo_pago_mensual debe ser una fracción (0.05 = 5 %)',
        })
        .min(0, 'recargo_pago_mensual no puede ser negativo')
        .lt(1, 'recargo_pago_mensual debe ser menor que 1 (0.05 = 5 %)'),
    })
    .strict();
  override readonly pesosRequeridos: readonly PesoNombre[] = [
    'marca',
    'modelo',
    'anio',
    'tipo',
  ];
}

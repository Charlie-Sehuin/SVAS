import { z } from 'zod';
import { EstrategiaBase } from './estrategia-base';

/** Qualitas: promedio de pesos × (1 − descuento comercial) (doc contexto §17.5). PENDIENTE (Ola 1): fórmula. */
export class EstrategiaQualitas extends EstrategiaBase {
  readonly codigo = 'QUALITAS' as const;
  override readonly parametrosSchema = z
    .object({
      descuento_comercial: z
        .number({
          error: 'descuento_comercial debe ser una fracción (0.05 = 5 %)',
        })
        .min(0, 'descuento_comercial no puede ser negativo')
        .lt(1, 'descuento_comercial debe ser menor que 1 (0.05 = 5 %)'),
    })
    .strict();
}

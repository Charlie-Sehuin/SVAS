import { z } from 'zod';
import { EstrategiaBase } from './estrategia-base';

/** Mapfre: MAX(S × tasa, prima mínima) (doc contexto §17.5). PENDIENTE (Ola 1): fórmula. */
export class EstrategiaMapfre extends EstrategiaBase {
  readonly codigo = 'MAPFRE' as const;
  override readonly parametrosSchema = z
    .object({
      prima_minima_anual: z
        .number({ error: 'prima_minima_anual debe ser un monto en USD' })
        .positive('prima_minima_anual debe ser mayor que 0')
        .max(100_000, 'prima_minima_anual es demasiado alta'),
    })
    .strict();
}

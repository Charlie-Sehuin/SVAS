import Decimal from 'decimal.js';
import { z } from 'zod';
import type { PlanTarifa } from '../../modules/cotizacion/domain/tarifa.types';
import { EstrategiaBase, type Pesos } from './estrategia-base';

/** Mapfre (doc contexto §17.5): prima = MAX(S × tb × wM × wMo × wA, prima mínima). */
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

  protected primaAnual({
    S,
    plan,
    w,
  }: {
    S: Decimal;
    plan: PlanTarifa;
    w: Pesos;
  }) {
    const tasa = plan.tasaBase.mul(w.marca).mul(w.modelo).mul(w.anio);
    const calculada = S.mul(tasa);
    const minima = new Decimal(plan.parametros.prima_minima_anual as number);
    return {
      prima: Decimal.max(calculada, minima),
      paso: {
        tasa,
        calculada,
        primaMinima: minima,
        aplicoMinima: calculada.lt(minima),
      },
    };
  }
}

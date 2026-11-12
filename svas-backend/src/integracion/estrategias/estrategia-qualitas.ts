import Decimal from 'decimal.js';
import { z } from 'zod';
import type { PlanTarifa } from '../../modules/cotizacion/domain/tarifa.types';
import { EstrategiaBase, type Pesos } from './estrategia-base';

/**
 * Qualitas (doc contexto §17.5): promedia los pesos en vez de multiplicarlos.
 * prima = S × tb × (wM + wMo + wA) ÷ 3 × (1 − descuento comercial).
 */
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

  protected primaAnual({
    S,
    plan,
    w,
  }: {
    S: Decimal;
    plan: PlanTarifa;
    w: Pesos;
  }) {
    const pesoVehiculo = w.marca.add(w.modelo).add(w.anio).div(3);
    const descuento = new Decimal(
      plan.parametros.descuento_comercial as number,
    );
    return {
      prima: S.mul(plan.tasaBase)
        .mul(pesoVehiculo)
        .mul(new Decimal(1).sub(descuento)),
      paso: { pesoVehiculo, descuentoComercial: descuento },
    };
  }
}

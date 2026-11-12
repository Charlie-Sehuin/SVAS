import Decimal from 'decimal.js';
import { z } from 'zod';
import type {
  PesoNombre,
  PlanTarifa,
} from '../../modules/cotizacion/domain/tarifa.types';
import { EstrategiaBase, type Pesos } from './estrategia-base';

/**
 * La Positiva (doc contexto §17.5): tasa = tb × wM × wMo × wA × wT; prima = S × tasa.
 * En cuotas cobra un recargo: total = prima × (1 + recargo) (RN-38).
 */
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

  protected primaAnual({
    S,
    plan,
    w,
  }: {
    S: Decimal;
    plan: PlanTarifa;
    w: Pesos;
  }) {
    const tasa = plan.tasaBase
      .mul(w.marca)
      .mul(w.modelo)
      .mul(w.anio)
      .mul(w.tipo);
    return { prima: S.mul(tasa), paso: { tasa } };
  }

  override totalEnCuotas(primaFinal: Decimal, plan: PlanTarifa): Decimal {
    const recargo = new Decimal(plan.parametros.recargo_pago_mensual as number);
    return primaFinal.mul(recargo.add(1));
  }
}

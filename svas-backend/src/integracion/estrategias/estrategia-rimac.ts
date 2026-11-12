import { EstrategiaBase, type Pesos } from './estrategia-base';
import type Decimal from 'decimal.js';
import type { PlanTarifa } from '../../modules/cotizacion/domain/tarifa.types';

/** Rímac (doc contexto §17.5): tasa = tb × wM × wMo × wA; prima = S × tasa. */
export class EstrategiaRimac extends EstrategiaBase {
  readonly codigo = 'RIMAC' as const;

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
    return { prima: S.mul(tasa), paso: { tasa } };
  }
}

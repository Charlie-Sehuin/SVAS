import Decimal from 'decimal.js';
import { z } from 'zod';
import type {
  PesoNombre,
  PlanTarifa,
} from '../../modules/cotizacion/domain/tarifa.types';
import { EstrategiaBase, type Pesos } from './estrategia-base';

/** Pacífico (doc contexto §17.5): tasa = tb × wM × wMo × wA × wU; prima = S × tasa + cargo fijo. */
export class EstrategiaPacifico extends EstrategiaBase {
  readonly codigo = 'PACIFICO' as const;
  override readonly parametrosSchema = z
    .object({
      cargo_fijo_anual: z
        .number({ error: 'cargo_fijo_anual debe ser un monto en USD' })
        .min(0, 'cargo_fijo_anual no puede ser negativo')
        .max(10_000, 'cargo_fijo_anual es demasiado alto'),
    })
    .strict();
  /** Sin peso de ubigeo usa 1,00 "zona estándar" (RN-39, excepción). */
  override readonly pesosOpcionales: readonly PesoNombre[] = ['ubigeo'];

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
      .mul(w.ubigeo);
    const cargoFijo = new Decimal(plan.parametros.cargo_fijo_anual as number);
    return { prima: S.mul(tasa).add(cargoFijo), paso: { tasa, cargoFijo } };
  }
}

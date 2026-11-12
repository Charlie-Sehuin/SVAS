import type Decimal from 'decimal.js';
import { z } from 'zod';
import type {
  CodigoEstrategia,
  EstrategiaCotizacion,
} from '../../modules/cotizacion/domain/estrategia-cotizacion.port';
import type {
  PlanTarifa,
  ResultadoPlan,
  TarifaAseguradora,
  VehiculoCotizable,
} from '../../modules/cotizacion/domain/tarifa.types';
import { noImplementado } from '../no-implementado';

/**
 * Pasos comunes a las 5 aseguradoras: rango, suma, pesos, redondeo, mensual,
 * desglose (arquitectura backend §3.6.1).
 * PENDIENTE (Ola 1): pesosRequeridos() + primaAnual() abstractos y la lógica
 * de cotizar(). Hoy solo fija el contrato.
 */
export abstract class EstrategiaBase implements EstrategiaCotizacion {
  abstract readonly codigo: CodigoEstrategia;
  readonly parametrosSchema: z.ZodType = z.object({});

  cotizar(
    _v: VehiculoCotizable,
    _tarifa: TarifaAseguradora,
    _suma?: Decimal,
  ): Promise<ResultadoPlan[]> {
    return noImplementado(`Estrategia ${this.codigo}`, 'Ola 1');
  }

  totalEnCuotas(_primaFinal: Decimal, _plan: PlanTarifa): Decimal {
    return noImplementado(`Estrategia ${this.codigo}`, 'Ola 1');
  }
}

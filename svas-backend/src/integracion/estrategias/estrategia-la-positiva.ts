import { EstrategiaBase } from './estrategia-base';

/** La Positiva: … × wTipo; cuotas con recargo (override totalEnCuotas) (doc contexto §17.5). PENDIENTE (Ola 1). */
export class EstrategiaLaPositiva extends EstrategiaBase {
  readonly codigo = 'LA_POSITIVA' as const;
}

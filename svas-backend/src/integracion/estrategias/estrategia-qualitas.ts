import { EstrategiaBase } from './estrategia-base';

/** Qualitas: promedio de pesos × (1 − descuento comercial) (doc contexto §17.5). PENDIENTE (Ola 1). */
export class EstrategiaQualitas extends EstrategiaBase {
  readonly codigo = 'QUALITAS' as const;
}

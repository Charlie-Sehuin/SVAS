import { EstrategiaBase } from './estrategia-base';

/** Mapfre: MAX(S × tasa, prima mínima) (doc contexto §17.5). PENDIENTE (Ola 1). */
export class EstrategiaMapfre extends EstrategiaBase {
  readonly codigo = 'MAPFRE' as const;
}

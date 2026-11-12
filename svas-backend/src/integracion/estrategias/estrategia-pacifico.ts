import { EstrategiaBase } from './estrategia-base';

/** Pacífico: … × wUbigeo + cargo fijo anual (doc contexto §17.5). PENDIENTE (Ola 1). */
export class EstrategiaPacifico extends EstrategiaBase {
  readonly codigo = 'PACIFICO' as const;
}

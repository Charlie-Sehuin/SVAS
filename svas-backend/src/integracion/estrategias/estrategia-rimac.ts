import { EstrategiaBase } from './estrategia-base';

/** Rímac: tb × wMarca × wModelo × wAño (doc contexto §17.5). PENDIENTE (Ola 1). */
export class EstrategiaRimac extends EstrategiaBase {
  readonly codigo = 'RIMAC' as const;
}

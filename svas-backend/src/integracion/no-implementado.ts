import { NotImplementedException } from '@nestjs/common';

/** Marca un adaptador que todavía no implementa su ola (arquitectura backend §10.1.4). */
export function noImplementado(adaptador: string, ola: string): never {
  throw new NotImplementedException(`${adaptador} se implementa en la ${ola}`);
}

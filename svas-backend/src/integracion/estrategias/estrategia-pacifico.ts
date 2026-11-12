import { z } from 'zod';
import type { PesoNombre } from '../../modules/cotizacion/domain/tarifa.types';
import { EstrategiaBase } from './estrategia-base';

/** Pacífico: … × wUbigeo + cargo fijo anual (doc contexto §17.5). PENDIENTE (Ola 1): fórmula. */
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
}

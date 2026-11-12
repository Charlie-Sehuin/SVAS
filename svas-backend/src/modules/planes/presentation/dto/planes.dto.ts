import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator';
import { MAXIMO_PLANES_COMPARAR } from '../../domain/contenido-plan';

/** ?ids=a,b,c (también acepta ?ids=a&ids=b). */
export class CompararPlanesQuery {
  @Transform(({ value }: { value: unknown }) =>
    (Array.isArray(value) ? value : [value])
      .flatMap((v) => String(v ?? '').split(','))
      .map((v) => v.trim())
      .filter(Boolean),
  )
  @IsArray({ message: 'Indica los planes a comparar' })
  @ArrayMinSize(2, { message: 'Elige al menos 2 planes para comparar' })
  @ArrayMaxSize(MAXIMO_PLANES_COMPARAR, {
    message: `Puedes comparar hasta ${MAXIMO_PLANES_COMPARAR} planes`,
  })
  @ArrayUnique({ message: 'Hay planes repetidos' })
  @IsUUID('all', { each: true, message: 'Algún plan no es válido' })
  ids!: string[];
}

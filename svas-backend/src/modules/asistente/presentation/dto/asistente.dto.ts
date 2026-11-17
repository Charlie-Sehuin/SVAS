import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  MAX_MENSAJES,
  MAX_TEXTO_ASISTENTE,
  type RolMensaje,
} from '../../domain/asistente';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class MensajeDto {
  @IsIn(['usuario', 'asistente'], { message: 'El mensaje no es válido' })
  rol!: RolMensaje;

  // El tope más corto de lo que escribe la persona lo revisa el controlador
  // (depende del rol); este es el máximo de cualquier mensaje.
  @Transform(recortar)
  @IsString({ message: 'Escribe tu mensaje' })
  @MinLength(1, { message: 'Escribe tu mensaje' })
  @MaxLength(MAX_TEXTO_ASISTENTE, { message: 'El mensaje es demasiado largo' })
  texto!: string;
}

export class VehiculoMencionadoDto {
  @Transform(recortar)
  @IsString({ message: 'La marca no es válida' })
  @MinLength(1, { message: 'La marca no es válida' })
  @MaxLength(40, { message: 'La marca no es válida' })
  marca!: string;

  @Transform(recortar)
  @IsString({ message: 'El modelo no es válido' })
  @MinLength(1, { message: 'El modelo no es válido' })
  @MaxLength(60, { message: 'El modelo no es válido' })
  modelo!: string;

  @IsOptional()
  @IsInt({ message: 'El año no es válido' })
  @Min(1980, { message: 'El año no es válido' })
  @Max(2100, { message: 'El año no es válido' })
  anio?: number;
}

/** POST /asistente/mensajes y POST /cotizaciones/:id/asistente/mensajes */
export class ConversarDto {
  @IsArray({ message: 'Escribe tu mensaje' })
  @ArrayMinSize(1, { message: 'Escribe tu mensaje' })
  @ArrayMaxSize(MAX_MENSAJES, {
    message: 'La conversación es demasiado larga: empieza una nueva',
  })
  @ValidateNested({ each: true })
  @Type(() => MensajeDto)
  mensajes!: MensajeDto[];

  /** Auto reconocido por foto en el chat; solo se usa cuando no hay cotización. */
  @IsOptional()
  @IsObject({ message: 'El vehículo no es válido' })
  @ValidateNested()
  @Type(() => VehiculoMencionadoDto)
  vehiculo?: VehiculoMencionadoDto;
}

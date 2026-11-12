import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { USO_VEHICULO, type UsoVehiculo } from '../../../../shared/types/enums';

export class PerfilDto {
  @IsBoolean({ message: 'Indica si guardas el auto en cochera' })
  estacionaCochera!: boolean;

  @IsBoolean({ message: 'Indica si recorres muchos kilómetros al mes' })
  kmMesAlto!: boolean;

  @IsBoolean({ message: 'Indica si usas el auto de noche' })
  usoNocturno!: boolean;

  /** Soles por día, string decimal. Solo cuenta en uso comercial (RN-33). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'number' ? String(value) : value === '' ? null : value,
  )
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^\d{1,6}(\.\d{1,2})?$/, {
    message: 'Ingresa tu ingreso diario en soles, p. ej. 150.00',
  })
  ingresoDiarioSoles?: string | null;

  @IsOptional()
  @IsArray({ message: 'Las preocupaciones no son válidas' })
  @ArrayMaxSize(6, { message: 'Elige como máximo 6 preocupaciones' })
  @Matches(/^[A-Z][A-Z_]{1,29}$/, {
    each: true,
    message: 'Las preocupaciones no son válidas',
  })
  preocupaciones?: string[];
}

/** POST /cotizaciones/:id/prueba-choque */
export class SimularDto {
  @IsObject({ message: 'Responde las preguntas de tu perfil' })
  @ValidateNested()
  @Type(() => PerfilDto)
  perfil!: PerfilDto;
}

/** GET /prueba-choque/escenarios?uso= */
export class EscenariosQueryDto {
  @IsOptional()
  @IsIn(USO_VEHICULO, { message: 'El uso del vehículo no es válido' })
  uso?: UsoVehiculo;
}

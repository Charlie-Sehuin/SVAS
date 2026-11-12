import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TABLAS_PESO, type TablaPeso } from '../../domain/tarifas';

const ASEGURADORA_INVALIDA = { message: 'La aseguradora no es válida' };

export class TablaPesoParam {
  @IsIn(TABLAS_PESO, {
    message: 'La tabla debe ser marca, modelo, anio, tipo o ubigeo',
  })
  tabla!: TablaPeso;
}

export class AseguradoraOpcionalQuery {
  @IsOptional()
  @IsUUID('all', ASEGURADORA_INVALIDA)
  aseguradoraId?: string;
}

export class AseguradoraQuery {
  @IsUUID('all', ASEGURADORA_INVALIDA)
  aseguradoraId!: string;
}

export class RangosQuery extends AseguradoraQuery {
  @IsOptional()
  @IsUUID('all', { message: 'La marca no es válida' })
  marcaId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'El modelo no es válido' })
  modeloId?: string;
}

export class GuardarTarifaPlanDto {
  @IsNumber(
    { maxDecimalPlaces: 4 },
    {
      message:
        'La tasa base debe ser un número con hasta 4 decimales (0.0420 = 4,2 %)',
    },
  )
  @Min(0.0001, { message: 'La tasa base debe ser mayor que 0' })
  @Max(0.9999, {
    message: 'La tasa base debe ser menor que 1 (0.0420 = 4,2 %)',
  })
  tasaBase!: number;

  /** Lo valida el zod de la Estrategia de la aseguradora del plan. */
  @IsObject({ message: 'parametros debe ser un objeto JSON' })
  parametros!: Record<string, unknown>;
}

export class FilaPesoDto {
  @IsString({ message: 'La clave debe ser texto' })
  @MaxLength(36, { message: 'La clave no es válida' })
  clave!: string;

  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'El peso debe ser un número con hasta 3 decimales' },
  )
  @Min(0.5, { message: 'El peso debe estar entre 0,500 y 3,000' })
  @Max(3, { message: 'El peso debe estar entre 0,500 y 3,000' })
  peso!: number;
}

export class GuardarPesosDto extends AseguradoraQuery {
  @IsArray({ message: 'filas debe ser una lista' })
  @ArrayMinSize(1, { message: 'Indica al menos un peso' })
  @ArrayMaxSize(2000, { message: 'Máximo 2000 pesos por envío' })
  @ValidateNested({ each: true })
  @Type(() => FilaPesoDto)
  filas!: FilaPesoDto[];
}

export class FilaRangoDto {
  @IsUUID('all', { message: 'El modelo no es válido' })
  modeloId!: string;

  @IsInt({ message: 'El año debe ser un número entero' })
  @Min(1950, { message: 'El año debe estar entre 1950 y 2100' })
  @Max(2100, { message: 'El año debe estar entre 1950 y 2100' })
  anio!: number;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'La suma mínima debe ser un monto con hasta 2 decimales' },
  )
  @Min(0.01, { message: 'La suma mínima debe ser mayor que 0' })
  @Max(9_999_999_999.99, { message: 'La suma mínima es demasiado alta' })
  sumaMinima!: number;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'La suma máxima debe ser un monto con hasta 2 decimales' },
  )
  @Min(0.01, { message: 'La suma máxima debe ser mayor que 0' })
  @Max(9_999_999_999.99, { message: 'La suma máxima es demasiado alta' })
  sumaMaxima!: number;
}

export class GuardarRangosDto extends AseguradoraQuery {
  @IsArray({ message: 'filas debe ser una lista' })
  @ArrayMinSize(1, { message: 'Indica al menos un rango' })
  @ArrayMaxSize(5000, { message: 'Máximo 5000 rangos por envío' })
  @ValidateNested({ each: true })
  @Type(() => FilaRangoDto)
  filas!: FilaRangoDto[];
}

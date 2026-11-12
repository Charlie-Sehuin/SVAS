import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  TIPO_CAMPO,
  USO_VEHICULO,
  type TipoCampo,
  type UsoVehiculo,
} from '../../../../shared/types/enums';
import { ORIGENES_VALORES, type OrigenValores } from '../../domain/catalogo';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// ── Comunes ──────────────────────────────────────────────────────────────────
export class FiltroAseguradoraQuery {
  @IsOptional()
  @IsUUID('all', { message: 'La aseguradora no es válida' })
  aseguradoraId?: string;
}

export class CambiarEstadoAseguradoraDto {
  @IsBoolean({ message: 'activa debe ser true o false' })
  activa!: boolean;
}

// ── Planes ───────────────────────────────────────────────────────────────────
export class CrearPlanDto {
  @IsUUID('all', { message: 'La aseguradora no es válida' })
  aseguradoraId!: string;

  @Transform(recortar)
  @IsString({ message: 'Ingresa el nombre del plan' })
  @MinLength(2, { message: 'Ingresa el nombre del plan' })
  @MaxLength(80, { message: 'El nombre no puede pasar de 80 caracteres' })
  nombre!: string;

  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'La descripción debe ser texto' })
  @MaxLength(2000, {
    message: 'La descripción no puede pasar de 2000 caracteres',
  })
  descripcion?: string | null;
}

export class EditarPlanDto {
  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'Ingresa el nombre del plan' })
  @MinLength(2, { message: 'Ingresa el nombre del plan' })
  @MaxLength(80, { message: 'El nombre no puede pasar de 80 caracteres' })
  nombre?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'La descripción debe ser texto' })
  @MaxLength(2000, {
    message: 'La descripción no puede pasar de 2000 caracteres',
  })
  descripcion?: string | null;

  @IsOptional()
  @IsBoolean({ message: 'activo debe ser true o false' })
  activo?: boolean;
}

// ── Campos ───────────────────────────────────────────────────────────────────
export class GuardarCampoDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message:
      'El nombre del campo va en minúsculas, sin espacios (p. ej. numero_motor)',
  })
  @MaxLength(40, { message: 'El nombre no puede pasar de 40 caracteres' })
  nombre!: string;

  @IsIn(TIPO_CAMPO, { message: 'El tipo debe ser TEXTO, NUMERO o LISTA' })
  tipo!: TipoCampo;

  @IsBoolean({ message: 'obligatorio debe ser true o false' })
  obligatorio!: boolean;

  @IsOptional()
  @IsIn(ORIGENES_VALORES, { message: 'El origen debe ser ESTATICO o CATALOGO' })
  origenValores: OrigenValores = 'ESTATICO';

  @IsOptional()
  @IsArray({ message: 'valores debe ser una lista' })
  @ArrayMaxSize(100, { message: 'Máximo 100 valores permitidos' })
  @IsString({ each: true, message: 'Cada valor debe ser texto' })
  @MaxLength(60, {
    each: true,
    message: 'Cada valor puede tener hasta 60 caracteres',
  })
  valores: string[] = [];

  @IsOptional()
  @IsBoolean({ message: 'activo debe ser true o false' })
  activo?: boolean;
}

export class CrearCampoDto extends GuardarCampoDto {
  @IsUUID('all', { message: 'La aseguradora no es válida' })
  aseguradoraId!: string;
}

// ── Reglas de inspección ─────────────────────────────────────────────────────
export class ReglaInspeccionDto {
  @IsUUID('all', { message: 'La aseguradora no es válida' })
  aseguradoraId!: string;

  @IsIn(USO_VEHICULO, { message: 'El uso no es válido' })
  uso!: UsoVehiculo;

  @IsBoolean({ message: 'requiereInspeccion debe ser true o false' })
  requiereInspeccion!: boolean;
}

export class GuardarReglasDto {
  @IsArray({ message: 'reglas debe ser una lista' })
  @ArrayMinSize(1, { message: 'Indica al menos una regla de inspección' })
  @ArrayMaxSize(100, { message: 'Máximo 100 reglas por envío' })
  @ValidateNested({ each: true })
  @Type(() => ReglaInspeccionDto)
  reglas!: ReglaInspeccionDto[];
}

// ── Parámetros ───────────────────────────────────────────────────────────────
const PORCENTAJE = { maxDecimalPlaces: 2 } as const;
const ENTERO = (campo: string, min: number, max: number) => ({
  int: { message: `${campo} debe ser un número entero` },
  rango: { message: `${campo} debe estar entre ${min} y ${max}` },
});

export class ActualizarParametrosDto {
  @IsOptional()
  @IsNumber(PORCENTAJE, {
    message:
      'El descuento de primera compra debe ser un número con hasta 2 decimales',
  })
  @Min(0.01, { message: 'El descuento de primera compra debe ser mayor que 0' })
  @Max(100, {
    message: 'El descuento de primera compra no puede superar el 100 %',
  })
  descuentoPrimeraCompra?: number;

  @IsOptional()
  @IsNumber(PORCENTAJE, {
    message: 'El descuento máximo debe ser un número con hasta 2 decimales',
  })
  @Min(0.01, { message: 'El descuento máximo debe ser mayor que 0' })
  @Max(100, { message: 'El descuento máximo no puede superar el 100 %' })
  descuentoMaximo?: number;

  @IsOptional()
  @IsInt(ENTERO('maxIntentos', 1, 20).int)
  @Min(1, ENTERO('maxIntentos', 1, 20).rango)
  @Max(20, ENTERO('maxIntentos', 1, 20).rango)
  maxIntentos?: number;

  @IsOptional()
  @IsInt(ENTERO('diasSeguimiento', 1, 90).int)
  @Min(1, ENTERO('diasSeguimiento', 1, 90).rango)
  @Max(90, ENTERO('diasSeguimiento', 1, 90).rango)
  diasSeguimiento?: number;

  @IsOptional()
  @IsInt(ENTERO('maxCuotas', 1, 24).int)
  @Min(1, ENTERO('maxCuotas', 1, 24).rango)
  @Max(24, ENTERO('maxCuotas', 1, 24).rango)
  maxCuotas?: number;

  @IsOptional()
  @IsInt(ENTERO('vigenciaEnlaceDias', 1, 90).int)
  @Min(1, ENTERO('vigenciaEnlaceDias', 1, 90).rango)
  @Max(90, ENTERO('vigenciaEnlaceDias', 1, 90).rango)
  vigenciaEnlaceDias?: number;

  @IsOptional()
  @IsInt(ENTERO('horasAbandono', 1, 720).int)
  @Min(1, ENTERO('horasAbandono', 1, 720).rango)
  @Max(720, ENTERO('horasAbandono', 1, 720).rango)
  horasAbandono?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}$/, {
    message: 'La moneda va en código ISO de 3 letras (p. ej. USD)',
  })
  moneda?: string;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 4 },
    { message: 'El tipo de cambio debe ser un número con hasta 4 decimales' },
  )
  @Min(0.0001, { message: 'El tipo de cambio debe ser mayor que 0' })
  @Max(9999, { message: 'El tipo de cambio es demasiado alto' })
  tipoCambioReferencial?: number;
}

// ── Bitácora ─────────────────────────────────────────────────────────────────
export class BitacoraQuery {
  @IsOptional()
  @Transform(recortar)
  @Matches(/^[a-z_]{1,40}$/, { message: 'La entidad no es válida' })
  entidad?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'desde debe ser una fecha válida (ISO 8601)' })
  desde?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'hasta debe ser una fecha válida (ISO 8601)' })
  hasta?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pagina debe ser un número entero' })
  @Min(1, { message: 'pagina debe ser 1 o mayor' })
  pagina: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tamano debe ser un número entero' })
  @Min(1, { message: 'tamano debe ser entre 1 y 100' })
  @Max(100, { message: 'tamano debe ser entre 1 y 100' })
  tamano: number = 20;
}

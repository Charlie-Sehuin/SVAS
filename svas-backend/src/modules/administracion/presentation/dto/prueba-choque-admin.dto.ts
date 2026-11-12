import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  CONDICION_TALLER,
  USO_VEHICULO,
  VARIABLE_PERFIL,
  ZONA_RIESGO,
  type CondicionTaller,
  type UsoVehiculo,
  type VariablePerfil,
  type ZonaRiesgo,
} from '../../../../shared/types/enums';

const CODIGO_ESCENARIO = /^[A-Z][A-Z_]{1,29}$/;
const MSG_CODIGO = {
  message:
    'El escenario va por su código, en mayúsculas y guiones bajos (p. ej. CHOQUE_LEVE)',
};
const MSG_USO = {
  message:
    'El uso debe ser PARTICULAR, COMERCIAL_LIGERO o TRANSPORTE_PASAJEROS',
};
const MSG_ZONA = { message: 'La zona debe ser ALTA, MEDIA o BAJA' };
const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// ── Params y queries ────────────────────────────────────────────────────────
export class CodigoEscenarioParam {
  @Matches(CODIGO_ESCENARIO, MSG_CODIGO)
  codigo!: string;
}

export class CoberturasQuery {
  @IsOptional()
  @IsUUID('all', { message: 'El plan no es válido' })
  planId?: string;

  @IsOptional()
  @Matches(CODIGO_ESCENARIO, MSG_CODIGO)
  escenario?: string;
}

export class FrecuenciasQuery {
  @IsOptional()
  @Matches(CODIGO_ESCENARIO, MSG_CODIGO)
  escenario?: string;

  @IsOptional()
  @IsIn(USO_VEHICULO, MSG_USO)
  uso?: UsoVehiculo;
}

export class ZonasQuery {
  @IsOptional()
  @IsIn(ZONA_RIESGO, MSG_ZONA)
  zona?: ZonaRiesgo;
}

export class FactoresQuery {
  @IsOptional()
  @Matches(CODIGO_ESCENARIO, MSG_CODIGO)
  escenario?: string;
}

// ── Escenario ───────────────────────────────────────────────────────────────
export class GuardarEscenarioDto {
  @Transform(recortar)
  @IsString({ message: 'El nombre debe ser texto' })
  @MinLength(1, { message: 'El nombre del escenario es obligatorio' })
  @MaxLength(80, { message: 'El nombre admite hasta 80 caracteres' })
  nombre!: string;

  @Transform(recortar)
  @IsString({ message: 'La descripción debe ser texto' })
  @MinLength(1, { message: 'La descripción del escenario es obligatoria' })
  @MaxLength(500, { message: 'La descripción admite hasta 500 caracteres' })
  descripcion!: string;

  /** null = el daño es la suma asegurada de cada plan (ROBO_TOTAL, PERDIDA_TOTAL). Obligatorio. */
  @ValidateIf((o: GuardarEscenarioDto) => o.montoDanoReferencial !== null)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    {
      message:
        'El monto de daño debe ser un número con hasta 2 decimales, o null para usar la suma asegurada del plan',
    },
  )
  @Min(0.01, { message: 'El monto de daño debe ser mayor que 0' })
  @Max(9_999_999_999.99, { message: 'El monto de daño es demasiado alto' })
  montoDanoReferencial!: number | null;

  @IsInt({ message: 'Los días de taller deben ser un número entero' })
  @Min(0, { message: 'Los días de taller deben estar entre 0 y 365' })
  @Max(365, { message: 'Los días de taller deben estar entre 0 y 365' })
  diasTaller!: number;

  @IsInt({ message: 'El orden debe ser un número entero' })
  @Min(0, { message: 'El orden debe estar entre 0 y 1000' })
  @Max(1000, { message: 'El orden debe estar entre 0 y 1000' })
  orden!: number;

  @IsBoolean({ message: 'activo debe ser true o false' })
  activo!: boolean;
}

// ── Coberturas ──────────────────────────────────────────────────────────────
export class FilaCoberturaDto {
  @IsUUID('all', { message: 'El plan no es válido' })
  planId!: string;

  @Matches(CODIGO_ESCENARIO, MSG_CODIGO)
  escenario!: string;

  @IsBoolean({ message: 'cubre debe ser true o false' })
  cubre!: boolean;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El deducible debe ser un porcentaje con hasta 2 decimales' },
  )
  @Min(0, { message: 'El deducible debe estar entre 0 y 100 %' })
  @Max(100, { message: 'El deducible debe estar entre 0 y 100 %' })
  deduciblePct?: number | null;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El deducible mínimo debe ser un monto con hasta 2 decimales' },
  )
  @Min(0, { message: 'El deducible mínimo no puede ser negativo' })
  @Max(9_999_999_999.99, { message: 'El deducible mínimo es demasiado alto' })
  deducibleMinimo?: number | null;

  /** null u omitido = hasta la suma asegurada. */
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El tope debe ser un monto con hasta 2 decimales' },
  )
  @Min(0.01, { message: 'El tope debe ser mayor que 0' })
  @Max(9_999_999_999.99, { message: 'El tope es demasiado alto' })
  topeCobertura?: number | null;

  @IsOptional()
  @IsIn(CONDICION_TALLER, {
    message: 'La condición de taller debe ser AFILIADO o CUALQUIERA',
  })
  condicionTaller?: CondicionTaller;

  @IsOptional()
  @IsInt({ message: 'Los días de reemplazo deben ser un número entero' })
  @Min(0, { message: 'Los días de reemplazo deben estar entre 0 y 365' })
  @Max(365, { message: 'Los días de reemplazo deben estar entre 0 y 365' })
  diasAutoReemplazo?: number;

  /** De dónde sale el dato (condicionado, póliza, etc.). */
  @Transform(recortar)
  @IsString({ message: 'La fuente debe ser texto' })
  @MinLength(1, {
    message: 'Indica la fuente del dato (p. ej. el condicionado)',
  })
  @MaxLength(200, { message: 'La fuente admite hasta 200 caracteres' })
  fuente!: string;
}

export class GuardarCoberturasDto {
  @IsArray({ message: 'filas debe ser una lista' })
  @ArrayMinSize(1, { message: 'Indica al menos una cobertura' })
  @ArrayMaxSize(500, { message: 'Máximo 500 coberturas por envío' })
  @ValidateNested({ each: true })
  @Type(() => FilaCoberturaDto)
  filas!: FilaCoberturaDto[];
}

// ── Frecuencias ─────────────────────────────────────────────────────────────
export class FilaFrecuenciaDto {
  @Matches(CODIGO_ESCENARIO, MSG_CODIGO)
  escenario!: string;

  @IsIn(USO_VEHICULO, MSG_USO)
  uso!: UsoVehiculo;

  @IsIn(ZONA_RIESGO, MSG_ZONA)
  zona!: ZonaRiesgo;

  @IsNumber(
    { maxDecimalPlaces: 4 },
    {
      message:
        'La probabilidad anual debe ser un número con hasta 4 decimales (0.12 = 12 % al año)',
    },
  )
  @Min(0.0001, {
    message: 'La probabilidad anual debe estar entre 0.0001 y 0.95',
  })
  @Max(0.95, {
    message: 'La probabilidad anual debe estar entre 0.0001 y 0.95',
  })
  probabilidadAnual!: number;
}

export class GuardarFrecuenciasDto {
  @IsArray({ message: 'filas debe ser una lista' })
  @ArrayMinSize(1, { message: 'Indica al menos una frecuencia' })
  @ArrayMaxSize(500, { message: 'Máximo 500 frecuencias por envío' })
  @ValidateNested({ each: true })
  @Type(() => FilaFrecuenciaDto)
  filas!: FilaFrecuenciaDto[];
}

// ── Zonas ───────────────────────────────────────────────────────────────────
export class FilaZonaDto {
  @Matches(/^[0-9]{6}$/, { message: 'El ubigeo debe tener 6 dígitos' })
  ubigeo!: string;

  @IsIn(ZONA_RIESGO, MSG_ZONA)
  zona!: ZonaRiesgo;
}

export class GuardarZonasDto {
  @IsArray({ message: 'filas debe ser una lista' })
  @ArrayMinSize(1, { message: 'Indica al menos un distrito' })
  @ArrayMaxSize(2000, { message: 'Máximo 2000 distritos por envío' })
  @ValidateNested({ each: true })
  @Type(() => FilaZonaDto)
  filas!: FilaZonaDto[];
}

// ── Factores ────────────────────────────────────────────────────────────────
export class FilaFactorDto {
  @Matches(CODIGO_ESCENARIO, MSG_CODIGO)
  escenario!: string;

  @IsIn(VARIABLE_PERFIL, {
    message:
      'La variable debe ser ESTACIONA_COCHERA, KM_MES_ALTO o USO_NOCTURNO',
  })
  variable!: VariablePerfil;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El multiplicador debe ser un número con hasta 2 decimales' },
  )
  @Min(0.1, {
    message:
      'El multiplicador debe estar entre 0.10 y 3.00 (1.00 = sin efecto)',
  })
  @Max(3, {
    message:
      'El multiplicador debe estar entre 0.10 y 3.00 (1.00 = sin efecto)',
  })
  multiplicador!: number;
}

export class GuardarFactoresDto {
  @IsArray({ message: 'filas debe ser una lista' })
  @ArrayMinSize(1, { message: 'Indica al menos un factor' })
  @ArrayMaxSize(500, { message: 'Máximo 500 factores por envío' })
  @ValidateNested({ each: true })
  @Type(() => FilaFactorDto)
  filas!: FilaFactorDto[];
}

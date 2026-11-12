import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  CATEGORIAS_COBERTURA,
  TIPOS_REQUISITO,
  type CategoriaCobertura,
  type TipoRequisito,
} from '../../../planes/domain/contenido-plan';

const CODIGO = /^[A-Z][A-Z_]{1,29}$/;
const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const recortarLista = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((v) => (typeof v === 'string' ? v.trim() : v))
    : value;

export class CodigoCoberturaParam {
  @Matches(CODIGO, {
    message:
      'El código de la cobertura va en mayúsculas y guiones bajos (p. ej. ROBO_TOTAL)',
  })
  codigo!: string;
}

// ── Contenido de un plan ────────────────────────────────────────────────────
export class CoberturaDePlanDto {
  @Matches(CODIGO, { message: 'El código de la cobertura no es válido' })
  codigo!: string;

  @IsBoolean({ message: 'incluida debe ser true o false' })
  incluida!: boolean;

  /** Texto que ve el cliente: "Hasta USD 100,000", "4 servicios al año". */
  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'El detalle debe ser texto' })
  @MinLength(1, { message: 'El detalle no puede ir vacío (usa null)' })
  @MaxLength(200, { message: 'El detalle admite hasta 200 caracteres' })
  detalle?: string | null;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El límite debe ser un monto con hasta 2 decimales' },
  )
  @Min(0.01, { message: 'El límite debe ser mayor que 0' })
  @Max(9_999_999_999.99, { message: 'El límite es demasiado alto' })
  limiteMonto?: number | null;
}

export class RequisitoDto {
  @IsIn(TIPOS_REQUISITO, {
    message: 'El tipo debe ser VEHICULO, CONDUCTOR, DOCUMENTO o INSPECCION',
  })
  tipo!: TipoRequisito;

  @Transform(recortar)
  @IsString({ message: 'El texto del requisito debe ser texto' })
  @MinLength(1, { message: 'El texto del requisito es obligatorio' })
  @MaxLength(240, { message: 'El requisito admite hasta 240 caracteres' })
  texto!: string;

  @IsOptional()
  @IsBoolean({ message: 'obligatorio debe ser true o false' })
  obligatorio?: boolean;
}

export class GuardarContenidoPlanDto {
  @Transform(recortar)
  @IsString({ message: 'El resumen debe ser texto' })
  @MinLength(1, { message: 'El resumen es obligatorio' })
  @MaxLength(160, { message: 'El resumen admite hasta 160 caracteres' })
  resumen!: string;

  @Transform(recortar)
  @IsString({ message: 'La descripción debe ser texto' })
  @MinLength(1, { message: 'La descripción es obligatoria' })
  @MaxLength(1000, { message: 'La descripción admite hasta 1000 caracteres' })
  descripcion!: string;

  @Transform(recortar)
  @IsString({ message: '"Ideal para" debe ser texto' })
  @MinLength(1, { message: 'El campo "ideal para" es obligatorio' })
  @MaxLength(200, { message: '"Ideal para" admite hasta 200 caracteres' })
  idealPara!: string;

  /** Todas las coberturas activas del catálogo, cada una con sí o no (RN-42). */
  @IsArray({ message: 'coberturas debe ser una lista' })
  @ArrayMinSize(1, { message: 'Indica las coberturas del plan' })
  @ArrayMaxSize(100, { message: 'Demasiadas coberturas' })
  @ValidateNested({ each: true })
  @Type(() => CoberturaDePlanDto)
  coberturas!: CoberturaDePlanDto[];

  @Transform(recortarLista)
  @IsArray({ message: 'exclusiones debe ser una lista de textos' })
  @ArrayMinSize(1, { message: 'Indica al menos una exclusión' })
  @ArrayMaxSize(30, { message: 'Máximo 30 exclusiones por plan' })
  @IsString({ each: true, message: 'Cada exclusión es un texto' })
  @MinLength(1, { each: true, message: 'Una exclusión no puede ir vacía' })
  @MaxLength(240, {
    each: true,
    message: 'Cada exclusión admite hasta 240 caracteres',
  })
  exclusiones!: string[];

  @IsArray({ message: 'requisitos debe ser una lista' })
  @ArrayMinSize(1, { message: 'Indica al menos un requisito' })
  @ArrayMaxSize(20, { message: 'Máximo 20 requisitos por plan' })
  @ValidateNested({ each: true })
  @Type(() => RequisitoDto)
  requisitos!: RequisitoDto[];
}

// ── Cobertura del catálogo ──────────────────────────────────────────────────
export class GuardarCoberturaDto {
  @Transform(recortar)
  @IsString({ message: 'El nombre debe ser texto' })
  @MinLength(1, { message: 'El nombre de la cobertura es obligatorio' })
  @MaxLength(80, { message: 'El nombre admite hasta 80 caracteres' })
  nombre!: string;

  @IsIn(CATEGORIAS_COBERTURA, {
    message:
      'La categoría debe ser DANOS_PROPIOS, ROBO, RESPONSABILIDAD, ASISTENCIA o ADICIONAL',
  })
  categoria!: CategoriaCobertura;

  @Transform(recortar)
  @IsString({ message: 'La descripción debe ser texto' })
  @MinLength(1, { message: 'La descripción de la cobertura es obligatoria' })
  @MaxLength(300, { message: 'La descripción admite hasta 300 caracteres' })
  descripcion!: string;

  @IsInt({ message: 'El orden debe ser un número entero' })
  @Min(0, { message: 'El orden debe estar entre 0 y 1000' })
  @Max(1000, { message: 'El orden debe estar entre 0 y 1000' })
  orden!: number;

  @IsBoolean({ message: 'activa debe ser true o false' })
  activa!: boolean;

  /** Escenarios de la Prueba de Choque que esta cobertura representa (RN-43); puede ir vacío. */
  @IsArray({ message: 'escenarios debe ser una lista de códigos' })
  @ArrayMaxSize(20, { message: 'Demasiados escenarios' })
  @ArrayUnique({ message: 'Hay escenarios repetidos' })
  @Matches(CODIGO, {
    each: true,
    message: 'Cada escenario va por su código (p. ej. ROBO_AUTOPARTES)',
  })
  escenarios!: string[];
}

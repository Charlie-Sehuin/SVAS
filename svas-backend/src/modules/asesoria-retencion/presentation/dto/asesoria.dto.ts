import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  CANAL_CONTACTO,
  ESTADO_SEGUIMIENTO,
  ESTADO_SOLICITUD,
  MOTIVO_CIERRE,
  ORIGEN_CASO,
  RESULTADO_INTENTO,
  type CanalContacto,
  type EstadoSeguimiento,
  type EstadoSolicitud,
  type MotivoCierre,
  type OrigenCaso,
  type ResultadoIntento,
} from '../../../../shared/types/enums';

/** El cliente solo pide por estos motivos; INSPECCION y NO_ASEGURABLE las crea el sistema. */
export const MOTIVOS_CLIENTE = ['DUDA', 'NEGOCIACION', 'DESCUENTO'] as const;
export type MotivoCliente = (typeof MOTIVOS_CLIENTE)[number];

const MENSAJE_CANAL = 'Elige cómo prefieres que te contactemos';

/** POST /asesorias */
export class SolicitarAsesoriaDto {
  @IsUUID('all', { message: 'La cotización no es válida' })
  cotizacionId!: string;

  @IsIn(MOTIVOS_CLIENTE, {
    message: 'Elige el motivo: duda, negociación o descuento',
  })
  motivo!: MotivoCliente;

  @IsIn(CANAL_CONTACTO, { message: MENSAJE_CANAL })
  canal!: CanalContacto;
}

/** GET /asesorias/cola?estado=&origen= */
export class ColaQueryDto {
  @IsOptional()
  @IsIn(ESTADO_SOLICITUD, { message: 'El estado no es válido' })
  estado?: EstadoSolicitud;

  @IsOptional()
  @IsIn(ORIGEN_CASO, { message: 'El origen no es válido' })
  origen?: OrigenCaso;
}

/** POST /asesorias/:id/descuentos. Porcentaje como string decimal ("8.50"). */
export class DescuentoDto {
  @IsUUID('all', { message: 'Elige el plan' })
  planId!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'number' ? String(value) : value,
  )
  @IsString({ message: 'Ingresa el porcentaje de descuento' })
  @Matches(/^\d{1,3}(\.\d{1,2})?$/, {
    message: 'Ingresa el porcentaje como número, p. ej. 8.50',
  })
  porcentaje!: string;
}

/** POST /asesorias/:id/resultado */
export class ResultadoSolicitudDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Describe el resultado de la atención' })
  @MinLength(1, { message: 'Describe el resultado de la atención' })
  @MaxLength(200, { message: 'El resultado no puede pasar de 200 caracteres' })
  resultado!: string;

  @IsBoolean({ message: 'Indica si el cliente aceptó' })
  acepta!: boolean;
}

/** GET /seguimientos?estado= */
export class SeguimientosQueryDto {
  @IsOptional()
  @IsIn(ESTADO_SEGUIMIENTO, { message: 'El estado no es válido' })
  estado?: EstadoSeguimiento;
}

/** POST /seguimientos/:id/intentos */
export class IntentoDto {
  @IsIn(CANAL_CONTACTO, { message: 'Elige el canal del intento' })
  canal!: CanalContacto;

  @IsIn(RESULTADO_INTENTO, { message: 'Elige el resultado del intento' })
  resultado!: ResultadoIntento;
}

/** POST /seguimientos/:id/cierre. DESCARTADO exige motivo (RN-11). */
export class CierreSeguimientoDto {
  @IsIn(['CONVERTIDO', 'DESCARTADO'], {
    message: 'El cierre debe ser CONVERTIDO o DESCARTADO',
  })
  estado!: Exclude<EstadoSeguimiento, 'EN_SEGUIMIENTO'>;

  @ValidateIf(
    (o: CierreSeguimientoDto) => o.estado === 'DESCARTADO' || o.motivo != null,
  )
  @IsIn(MOTIVO_CIERRE, { message: 'Elige el motivo del cierre' })
  motivo?: MotivoCierre | null;
}

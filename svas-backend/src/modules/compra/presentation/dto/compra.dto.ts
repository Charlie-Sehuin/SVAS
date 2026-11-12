import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { MODO_PAGO, type ModoPago } from '../../../../shared/types/enums';
import { FORMATO_DOCUMENTO, FORMATO_PLACA } from '../../domain/compra';

const mayusculas = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

/** GET /compras/resumen?cotizacionId=&primaCotizadaId= */
export class ResumenQueryDto {
  @IsUUID('all', { message: 'La cotización no es válida' })
  cotizacionId!: string;

  @IsUUID('all', { message: 'Elige el plan que quieres comprar' })
  primaCotizadaId!: string;
}

/** PUT /compras/:cotizacionId/datos (RNF-08). */
export class DatosCompraDto {
  @IsOptional()
  @Transform(mayusculas)
  @IsString({ message: 'Ingresa tu número de documento' })
  @Matches(FORMATO_DOCUMENTO, {
    message:
      'El número de documento debe tener 8 dígitos (DNI) o de 9 a 12 caracteres',
  })
  numeroDocumento?: string;

  @IsOptional()
  @Transform(mayusculas)
  @IsString({ message: 'Ingresa la placa del vehículo' })
  @Matches(FORMATO_PLACA, { message: 'La placa debe tener el formato ABC-123' })
  placa?: string;
}

/** POST /compras (RF-24: acepta y firma). */
export class CrearCompraDto {
  @IsUUID('all', { message: 'La cotización no es válida' })
  cotizacionId!: string;

  @IsUUID('all', { message: 'Elige el plan que quieres comprar' })
  primaCotizadaId!: string;

  @IsBoolean({ message: 'Debes aceptar las condiciones para continuar' })
  @Equals(true, { message: 'Debes aceptar las condiciones para continuar' })
  aceptaCondiciones!: boolean;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Escribe tu nombre completo como firma' })
  @MinLength(1, { message: 'Escribe tu nombre completo como firma' })
  @MaxLength(120, { message: 'La firma admite como máximo 120 caracteres' })
  firmaSimulada!: string;

  @IsOptional()
  @IsIn(['RETOMA'], { message: 'El origen de la compra no es válido' })
  origen?: 'RETOMA';
}

/** POST /compras/:id/pago. El rango de cuotas (2..max_cuotas) lo valida ProcesarPagoService. */
export class PagarDto {
  @IsIn(MODO_PAGO, { message: 'Elige cómo pagar: al contado o en cuotas' })
  modo!: ModoPago;

  @ValidateIf((o: PagarDto) => o.numeroCuotas !== undefined)
  @Type(() => Number)
  @IsInt({ message: 'El número de cuotas debe ser un número entero' })
  numeroCuotas?: number;
}

/** Idempotency-Key: un UUID o cualquier valor de 8 a 100 caracteres seguros. */
export const FORMATO_IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]{8,100}$/;

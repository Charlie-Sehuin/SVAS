import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
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
  CANAL_CONTACTO,
  USO_VEHICULO,
  type CanalContacto,
  type UsoVehiculo,
} from '../../../../shared/types/enums';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const vacioANull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : recortar({ value });
const soloDigitos = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s-]/g, '') : value;

const MENSAJE_TELEFONO =
  'Ingresa un celular peruano de 9 dígitos que empiece con 9';

export class VehiculoCotizarDto {
  @IsIn(USO_VEHICULO, { message: 'Elige el uso del vehículo' })
  uso!: UsoVehiculo;

  @IsUUID('all', { message: 'Elige la marca' })
  marcaId!: string;

  @IsUUID('all', { message: 'Elige el modelo' })
  modeloId!: string;

  @Type(() => Number)
  @IsInt({ message: 'Elige el año' })
  @Min(1950, { message: 'Elige un año válido' })
  @Max(2100, { message: 'Elige un año válido' })
  anio!: number;

  @IsOptional()
  @Transform(vacioANull)
  @IsString({ message: 'La clase no es válida' })
  @MaxLength(30, { message: 'La clase no puede pasar de 30 caracteres' })
  clase?: string | null;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    const v = vacioANull({ value });
    return typeof v === 'string' ? v.toUpperCase() : v;
  })
  @Matches(/^[A-Z0-9]{3}-?[0-9]{3}$/, {
    message: 'Ingresa la placa con el formato ABC-123',
  })
  placa?: string | null;
}

export class UbicacionCotizarDto {
  @Matches(/^[0-9]{6}$/, { message: 'Elige el distrito' })
  ubigeo!: string;
}

export class ContactoCotizarDto {
  @Transform(recortar)
  @IsString({ message: 'Ingresa tus nombres' })
  @MinLength(2, { message: 'Ingresa tus nombres' })
  @MaxLength(80, { message: 'Los nombres no pueden pasar de 80 caracteres' })
  nombres!: string;

  @Transform(recortar)
  @IsString({ message: 'Ingresa tus apellidos' })
  @MinLength(2, { message: 'Ingresa tus apellidos' })
  @MaxLength(80, { message: 'Los apellidos no pueden pasar de 80 caracteres' })
  apellidos!: string;

  @Transform(soloDigitos)
  @Matches(/^9\d{8}$/, { message: MENSAJE_TELEFONO })
  telefono!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Ingresa un email válido' })
  @MaxLength(254, { message: 'El email es demasiado largo' })
  email!: string;

  @IsIn(CANAL_CONTACTO, { message: 'Elige cómo prefieres que te contactemos' })
  canalPreferido!: CanalContacto;
}

/** POST /cotizaciones (doc conexión §6). No lleva suma: arranca en el punto medio (RN-37). */
export class CotizarDto {
  // @ValidateNested no falla si el objeto falta: @IsObject lo exige.
  @IsObject({ message: 'Faltan los datos del vehículo' })
  @ValidateNested()
  @Type(() => VehiculoCotizarDto)
  vehiculo!: VehiculoCotizarDto;

  @IsObject({ message: 'Falta el distrito donde se usa el vehículo' })
  @ValidateNested()
  @Type(() => UbicacionCotizarDto)
  ubicacion!: UbicacionCotizarDto;

  @IsObject({ message: 'Faltan tus datos de contacto' })
  @ValidateNested()
  @Type(() => ContactoCotizarDto)
  contacto!: ContactoCotizarDto;
}

/** PATCH …/suma-asegurada. Monto como string decimal ("15000.00"), nunca float. */
export class AjustarSumaDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'number' ? String(value) : value,
  )
  @IsString({ message: 'Ingresa la suma asegurada' })
  @Matches(/^\d{1,10}(\.\d{1,2})?$/, {
    message: 'Ingresa la suma asegurada como monto, p. ej. 15000.00',
  })
  sumaAsegurada!: string;
}

/** PATCH /cotizaciones/:id/cliente: vincula a la cuenta y/o actualiza contacto. */
export class VincularClienteDto {
  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'Ingresa tus nombres' })
  @MinLength(2, { message: 'Ingresa tus nombres' })
  @MaxLength(80, { message: 'Los nombres no pueden pasar de 80 caracteres' })
  nombres?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'Ingresa tus apellidos' })
  @MinLength(2, { message: 'Ingresa tus apellidos' })
  @MaxLength(80, { message: 'Los apellidos no pueden pasar de 80 caracteres' })
  apellidos?: string;

  @IsOptional()
  @Transform(soloDigitos)
  @Matches(/^9\d{8}$/, { message: MENSAJE_TELEFONO })
  telefono?: string;

  @IsOptional()
  @IsIn(CANAL_CONTACTO, { message: 'Elige cómo prefieres que te contactemos' })
  canalPreferido?: CanalContacto;
}

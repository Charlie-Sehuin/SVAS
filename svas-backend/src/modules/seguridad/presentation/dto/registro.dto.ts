import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Registro mínimo en el embudo (doc conexión §2). No acepta `rol`: siempre CLIENTE. */
export class RegistroDto {
  @Transform(recortar)
  @IsString({ message: 'Ingresa tus nombres' })
  @MinLength(2, { message: 'Ingresa tus nombres' })
  @MaxLength(79, { message: 'Los nombres no pueden pasar de 79 caracteres' })
  nombres!: string;

  @Transform(recortar)
  @IsString({ message: 'Ingresa tus apellidos' })
  @MinLength(2, { message: 'Ingresa tus apellidos' })
  @MaxLength(79, { message: 'Los apellidos no pueden pasar de 79 caracteres' })
  apellidos!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Ingresa un email válido' })
  @MaxLength(254, { message: 'El email es demasiado largo' })
  email!: string;

  @IsString({ message: 'Ingresa una contraseña' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(72, { message: 'La contraseña no puede pasar de 72 caracteres' })
  password!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '') : value,
  )
  @Matches(/^9\d{8}$/, {
    message: 'Ingresa un celular peruano de 9 dígitos que empiece con 9',
  })
  telefono!: string;

  @IsOptional()
  @IsUUID('all', { message: 'La cotización no es válida' })
  cotizacionId?: string;
}

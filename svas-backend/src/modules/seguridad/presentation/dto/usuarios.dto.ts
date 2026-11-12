import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ROL, type Rol } from '../../../../shared/types/enums';
import {
  ROLES_INTERNOS,
  type RolInterno,
  type Usuario,
} from '../../domain/usuario';

const MENSAJE_ROL_INTERNO = 'El rol debe ser ASESOR o ADMINISTRADOR';

export class CrearUsuarioDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Ingresa un email válido' })
  @MaxLength(254, { message: 'El email es demasiado largo' })
  email!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString({ message: 'Ingresa el nombre completo' })
  @MinLength(3, { message: 'Ingresa el nombre completo' })
  @MaxLength(160, { message: 'El nombre no puede pasar de 160 caracteres' })
  nombreCompleto!: string;

  @IsIn(ROLES_INTERNOS, { message: MENSAJE_ROL_INTERNO })
  rol!: RolInterno;
}

export class CambiarRolDto {
  @IsIn(ROLES_INTERNOS, { message: MENSAJE_ROL_INTERNO })
  rol!: RolInterno;
}

export class CambiarEstadoDto {
  @IsBoolean({ message: 'activo debe ser true o false' })
  activo!: boolean;
}

export class ListarUsuariosQuery {
  @IsOptional()
  @IsIn(ROL, { message: 'Rol no válido' })
  rol?: Rol;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'activo debe ser true o false' })
  activo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'La búsqueda es demasiado larga' })
  busqueda?: string;

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

/** DTO de salida explícito: nunca se devuelve la fila cruda. */
export interface UsuarioResponseDto {
  id: string;
  email: string;
  rol: Rol;
  nombreCompleto: string;
  activo: boolean;
}

export function aUsuarioResponse(u: Usuario): UsuarioResponseDto {
  return {
    id: u.id,
    email: u.email,
    rol: u.rol,
    nombreCompleto: u.nombreCompleto,
    activo: u.activo,
  };
}

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Rol } from '../../../shared/types/enums';
import {
  ContrasenaDebilError,
  CredencialesInvalidasError,
  CuentaBloqueadaError,
  EmailYaRegistradoError,
  SesionInvalidaError,
} from '../domain/proveedor-identidad.port';
import type { Sesion } from '../domain/usuario';
import {
  USUARIO_REPOSITORY,
  type UsuarioRepository,
} from '../domain/usuario.repository.port';

/** Contrato de respuesta de login/registro/refresh (doc conexión §2). */
export interface RespuestaSesion {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string; email: string; roles: Rol[]; nombreCompleto: string };
}

export const MENSAJE_DESACTIVADO =
  'Tu usuario está desactivado. Contacta al administrador.';

/**
 * Paso común a login, refresh y registro: una sesión válida de Supabase no
 * basta; el perfil de negocio debe existir y estar activo.
 */
@Injectable()
export class SesionAutorizadaService {
  constructor(
    @Inject(USUARIO_REPOSITORY) private readonly usuarios: UsuarioRepository,
  ) {}

  async autorizar(sesion: Sesion): Promise<RespuestaSesion> {
    const usuario = await this.usuarios.buscarPorId(sesion.usuarioId);
    if (!usuario) {
      throw new ForbiddenException(
        'Tu cuenta no está habilitada en SeguroSimple.',
      );
    }
    if (!usuario.activo) throw new ForbiddenException(MENSAJE_DESACTIVADO);

    return {
      access_token: sesion.accessToken,
      refresh_token: sesion.refreshToken,
      expires_in: sesion.expiresIn,
      user: {
        id: usuario.id,
        email: usuario.email,
        roles: [usuario.rol], // la tabla es la fuente de verdad
        nombreCompleto: usuario.nombreCompleto,
      },
    };
  }
}

/** Errores del proveedor de identidad → HTTP con mensaje para el usuario. */
export function traducirErrorIdentidad(error: unknown): never {
  if (error instanceof CredencialesInvalidasError) {
    throw new UnauthorizedException('Email o contraseña incorrectos');
  }
  if (error instanceof CuentaBloqueadaError) {
    throw new ForbiddenException(MENSAJE_DESACTIVADO);
  }
  if (error instanceof SesionInvalidaError) {
    throw new UnauthorizedException(
      'Tu sesión expiró. Inicia sesión de nuevo.',
    );
  }
  if (error instanceof EmailYaRegistradoError) {
    throw new ConflictException('Ya existe una cuenta con ese email');
  }
  if (error instanceof ContrasenaDebilError) {
    throw new BadRequestException(
      'La contraseña es muy débil. Usa una más larga o más variada.',
    );
  }
  throw error;
}

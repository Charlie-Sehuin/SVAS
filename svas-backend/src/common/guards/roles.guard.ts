import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  SUPABASE_SERVICE_CLIENT,
  type SupabaseServiceClient,
} from '../../infrastructure/database/supabase-service-client.provider';
import { AUTH_OPCIONAL } from '../decorators/auth-opcional.decorator';
import { ES_PUBLICO } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import {
  esRol,
  type RequestConContexto,
  type Rol,
} from '../types/usuario-autenticado';

interface EstadoUsuario {
  activo: boolean;
  rol: Rol | null;
  expira: number;
}

export const CACHE_ESTADO_MS = 60_000;

/**
 * Guard global que corre después de SupabaseAuthGuard (arquitectura backend §3.4 y §4.1):
 * 1. Toda ruta autenticada exige que svas.usuario exista y esté activo (cache 60 s):
 *    un usuario desactivado con JWT vigente queda fuera.
 * 2. Si la ruta tiene @Roles(), descarta rápido con app_metadata.roles y confirma
 *    con el rol de la tabla (fuente de verdad).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly cache = new Map<string, EstadoUsuario>();

  constructor(
    private readonly reflector: Reflector,
    @Inject(SUPABASE_SERVICE_CLIENT) private readonly db: SupabaseServiceClient,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const objetivos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, objetivos))
      return true;

    const usuario = ctx.switchToHttp().getRequest<RequestConContexto>().usuario;
    if (!usuario) {
      if (this.reflector.getAllAndOverride<boolean>(AUTH_OPCIONAL, objetivos))
        return true;
      throw new UnauthorizedException('Debes iniciar sesión');
    }

    const requeridos = this.reflector.getAllAndOverride<Rol[] | undefined>(
      ROLES_KEY,
      objetivos,
    );
    if (
      requeridos?.length &&
      !requeridos.some((r) => usuario.roles.includes(r))
    ) {
      throw new ForbiddenException(
        'No tienes permiso para realizar esta acción',
      );
    }

    const estado = await this.estadoUsuario(usuario.id);
    if (!estado.activo) {
      throw new ForbiddenException(
        'Tu usuario está desactivado. Contacta al administrador.',
      );
    }
    if (
      requeridos?.length &&
      (!estado.rol || !requeridos.includes(estado.rol))
    ) {
      throw new ForbiddenException(
        'No tienes permiso para realizar esta acción',
      );
    }
    return true;
  }

  /** Para cuando un RPC admin cambie el rol o desactive a alguien. */
  invalidar(usuarioId: string): void {
    this.cache.delete(usuarioId);
  }

  private async estadoUsuario(id: string): Promise<EstadoUsuario> {
    const enCache = this.cache.get(id);
    if (enCache && enCache.expira > Date.now()) return enCache;

    const { data, error } = await this.db
      .from('usuario')
      .select('rol, activo')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      throw new ServiceUnavailableException(
        'No pudimos verificar tu usuario. Intenta de nuevo.',
      );
    }

    const fila = data as { rol: unknown; activo: boolean } | null;
    const estado: EstadoUsuario = {
      activo: fila?.activo === true,
      rol: fila && esRol(fila.rol) ? fila.rol : null,
      expira: Date.now() + CACHE_ESTADO_MS,
    };
    this.cache.set(id, estado);
    return estado;
  }
}

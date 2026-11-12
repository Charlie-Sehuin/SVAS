import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  type Provider,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import type { Env } from '../../config/env.validation';
import { AUTH_OPCIONAL } from '../decorators/auth-opcional.decorator';
import { ES_PUBLICO } from '../decorators/public.decorator';
import { esRol, type RequestConContexto } from '../types/usuario-autenticado';

/** Resuelve la clave pública por `kid`. En producción: JWKS remoto de Supabase (jose lo cachea). */
export const JWT_KEY_RESOLVER = Symbol('JWT_KEY_RESOLVER');

export const jwtKeyResolverProvider: Provider = {
  provide: JWT_KEY_RESOLVER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) =>
    createRemoteJWKSet(
      new URL(config.get('SUPABASE_JWKS_URL', { infer: true })),
    ),
};

/**
 * Guard global (arquitectura backend §3.4). Verifica firma, emisor, audiencia
 * y expiración del JWT de Supabase y adjunta { id, email, roles } a la request.
 * Las rutas @Public() pasan sin JWT.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly issuer: string;

  constructor(
    private readonly reflector: Reflector,
    @Inject(JWT_KEY_RESOLVER) private readonly claves: JWTVerifyGetKey,
    config: ConfigService<Env, true>,
  ) {
    this.issuer = `${config.get('SUPABASE_URL', { infer: true }).replace(/\/$/, '')}/auth/v1`;
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (esPublico) return true;

    const req = ctx.switchToHttp().getRequest<RequestConContexto>();
    const token = extraerBearer(req.headers.authorization);
    if (!token) {
      const opcional = this.reflector.getAllAndOverride<boolean>(
        AUTH_OPCIONAL,
        [ctx.getHandler(), ctx.getClass()],
      );
      if (opcional) return true;
      throw new UnauthorizedException('Debes iniciar sesión');
    }

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.claves, {
        issuer: this.issuer,
        audience: 'authenticated',
        algorithms: ['ES256', 'RS256'],
      }));
    } catch {
      throw new UnauthorizedException('Tu sesión expiró o no es válida');
    }

    if (!payload.sub || payload['role'] !== 'authenticated') {
      throw new UnauthorizedException('Tu sesión expiró o no es válida');
    }

    // Roles solo desde app_metadata (firmado por Supabase); nunca user_metadata.
    const appMetadata = payload['app_metadata'] as
      { roles?: unknown } | undefined;
    const roles = Array.isArray(appMetadata?.roles)
      ? appMetadata.roles.filter(esRol)
      : [];

    req.accessToken = token;
    req.usuario = {
      id: payload.sub,
      email: typeof payload['email'] === 'string' ? payload['email'] : null,
      roles,
    };
    return true;
  }
}

function extraerBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [tipo, token] = header.split(' ');
  return tipo?.toLowerCase() === 'bearer' && token ? token : null;
}

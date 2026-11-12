import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ConfigService } from '@nestjs/config';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
} from 'jose';
import { AuthOpcional } from '../decorators/auth-opcional.decorator';
import { Public } from '../decorators/public.decorator';
import type { RequestConContexto } from '../types/usuario-autenticado';
import { SupabaseAuthGuard } from './supabase-auth.guard';

const URL_SUPABASE = 'https://abcdefghijklmnopqrst.supabase.co';
const ISSUER = `${URL_SUPABASE}/auth/v1`;
const KID = 'clave-test';

class Privado {
  metodo() {}
}
@Public()
class Publico {
  metodo() {}
}
@AuthOpcional()
class Opcional {
  metodo() {}
}

function contexto(
  req: Partial<RequestConContexto>,
  clase: new () => { metodo(): void } = Privado,
) {
  return {
    getHandler: () => clase.prototype.metodo,
    getClass: () => clase,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('SupabaseAuthGuard', () => {
  let privada: CryptoKey;
  let guard: SupabaseAuthGuard;

  beforeAll(async () => {
    const par = await generateKeyPair('ES256');
    privada = par.privateKey;
    const jwk = { ...(await exportJWK(par.publicKey)), kid: KID, alg: 'ES256' };
    const config = { get: () => URL_SUPABASE } as unknown as ConfigService<
      never,
      true
    >;
    guard = new SupabaseAuthGuard(
      new Reflector(),
      createLocalJWKSet({ keys: [jwk] }),
      config,
    );
  });

  function firmar(
    claims: Record<string, unknown>,
    opciones: { issuer?: string; exp?: string } = {},
  ) {
    return new SignJWT({ role: 'authenticated', ...claims })
      .setProtectedHeader({ alg: 'ES256', kid: KID })
      .setSubject('11111111-1111-1111-1111-111111111111')
      .setIssuer(opciones.issuer ?? ISSUER)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime(opciones.exp ?? '1h')
      .sign(privada);
  }

  it('deja pasar rutas @Public() sin token', async () => {
    await expect(
      guard.canActivate(contexto({ headers: {} }, Publico)),
    ).resolves.toBe(true);
  });

  it('401 si no hay token', async () => {
    await expect(guard.canActivate(contexto({ headers: {} }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('@AuthOpcional(): sin token pasa sin usuario', async () => {
    const req: Partial<RequestConContexto> = { headers: {} };
    await expect(guard.canActivate(contexto(req, Opcional))).resolves.toBe(
      true,
    );
    expect(req.usuario).toBeUndefined();
  });

  it('@AuthOpcional(): un token inválido igual da 401', async () => {
    await expect(
      guard.canActivate(
        contexto({ headers: { authorization: 'Bearer basura' } }, Opcional),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('@AuthOpcional(): con token válido adjunta el usuario', async () => {
    const token = await firmar({ app_metadata: { roles: ['CLIENTE'] } });
    const req: Partial<RequestConContexto> = {
      headers: { authorization: `Bearer ${token}` },
    };
    await expect(guard.canActivate(contexto(req, Opcional))).resolves.toBe(
      true,
    );
    expect(req.usuario?.roles).toEqual(['CLIENTE']);
  });

  it('acepta un token válido y adjunta id, email y roles de app_metadata', async () => {
    const token = await firmar({
      email: 'admin@test.com',
      app_metadata: { roles: ['ADMINISTRADOR', 'ROL_INVENTADO'] },
      user_metadata: { roles: ['ASESOR'] },
    });
    const req: Partial<RequestConContexto> = {
      headers: { authorization: `Bearer ${token}` },
    };

    await expect(guard.canActivate(contexto(req))).resolves.toBe(true);
    expect(req.usuario).toEqual({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'admin@test.com',
      roles: ['ADMINISTRADOR'], // ignora roles desconocidos y user_metadata
    });
  });

  it('401 si el token expiró', async () => {
    const token = await firmar({}, { exp: '-1m' });
    await expect(
      guard.canActivate(
        contexto({ headers: { authorization: `Bearer ${token}` } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('401 si el emisor es otro proyecto', async () => {
    const token = await firmar(
      {},
      { issuer: 'https://otro.supabase.co/auth/v1' },
    );
    await expect(
      guard.canActivate(
        contexto({ headers: { authorization: `Bearer ${token}` } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('401 si la firma no corresponde', async () => {
    const otraClave = (await generateKeyPair('ES256')).privateKey;
    const token = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: KID })
      .setSubject('x')
      .setIssuer(ISSUER)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(otraClave);
    await expect(
      guard.canActivate(
        contexto({ headers: { authorization: `Bearer ${token}` } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('401 si el rol de Postgres no es authenticated (p. ej. token anon)', async () => {
    const token = await firmar({ role: 'anon' });
    await expect(
      guard.canActivate(
        contexto({ headers: { authorization: `Bearer ${token}` } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });
});

import { Inject, Injectable } from '@nestjs/common';
import type { AuthError, Session } from '@supabase/supabase-js';
import {
  SUPABASE_SERVICE_CLIENT,
  type SupabaseServiceClient,
} from '../../../infrastructure/database/supabase-service-client.provider';
import { SupabaseUserClientFactory } from '../../../infrastructure/database/supabase-user-client.factory';
import {
  ContrasenaDebilError,
  CredencialesInvalidasError,
  CuentaBloqueadaError,
  EmailYaRegistradoError,
  type ProveedorIdentidad,
  SesionInvalidaError,
} from '../domain/proveedor-identidad.port';
import type { Sesion } from '../domain/usuario';

/** ~100 años: Supabase Auth no tiene "bloqueo indefinido". */
const BLOQUEO_INDEFINIDO = '876000h';

/** Adaptador de ProveedorIdentidad sobre Supabase Auth. */
@Injectable()
export class SupabaseProveedorIdentidad implements ProveedorIdentidad {
  constructor(
    @Inject(SUPABASE_SERVICE_CLIENT)
    private readonly admin: SupabaseServiceClient,
    private readonly clientes: SupabaseUserClientFactory,
  ) {}

  async iniciarSesion(email: string, password: string): Promise<Sesion> {
    const { data, error } = await this.clientes
      .anonimo()
      .auth.signInWithPassword({ email, password });
    if (error) {
      if (error.code === 'user_banned') throw new CuentaBloqueadaError();
      if (esErrorDeCliente(error)) throw new CredencialesInvalidasError();
      throw error;
    }
    return aSesion(data.session);
  }

  async refrescar(refreshToken: string): Promise<Sesion> {
    const { data, error } = await this.clientes
      .anonimo()
      .auth.refreshSession({ refresh_token: refreshToken });
    if (error) {
      if (esErrorDeCliente(error)) throw new SesionInvalidaError();
      throw error;
    }
    return aSesion(data.session);
  }

  async crearCuenta(email: string, password: string): Promise<{ id: string }> {
    const { data, error } = await this.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) {
      if (
        error.code === 'email_exists' ||
        error.code === 'user_already_exists'
      ) {
        throw new EmailYaRegistradoError();
      }
      if (error.code === 'weak_password')
        throw new ContrasenaDebilError(error.message);
      throw error;
    }
    return { id: data.user.id };
  }

  async eliminarCuenta(id: string): Promise<void> {
    const { error } = await this.admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }

  async bloquear(id: string, bloqueada: boolean): Promise<void> {
    const { error } = await this.admin.auth.admin.updateUserById(id, {
      ban_duration: bloqueada ? BLOQUEO_INDEFINIDO : 'none',
    });
    if (error) throw error;
  }
}

function esErrorDeCliente(error: AuthError): boolean {
  return (
    error.status !== undefined && error.status >= 400 && error.status < 500
  );
}

function aSesion(session: Session | null): Sesion {
  if (!session) throw new SesionInvalidaError();
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresIn: session.expires_in,
    usuarioId: session.user.id,
  };
}

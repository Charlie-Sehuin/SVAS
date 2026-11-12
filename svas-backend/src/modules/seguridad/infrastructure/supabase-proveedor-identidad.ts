import { Inject, Injectable } from '@nestjs/common';
import {
  SUPABASE_SERVICE_CLIENT,
  type SupabaseServiceClient,
} from '../../../infrastructure/database/supabase-service-client.provider';
import {
  ContrasenaDebilError,
  EmailYaRegistradoError,
  type ProveedorIdentidad,
} from '../domain/proveedor-identidad.port';

/** ~100 años: Supabase Auth no tiene "bloqueo indefinido". */
const BLOQUEO_INDEFINIDO = '876000h';

/** Adaptador de ProveedorIdentidad sobre la Admin API de Supabase Auth. */
@Injectable()
export class SupabaseProveedorIdentidad implements ProveedorIdentidad {
  constructor(
    @Inject(SUPABASE_SERVICE_CLIENT)
    private readonly admin: SupabaseServiceClient,
  ) {}

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

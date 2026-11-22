import { Inject, Injectable } from '@nestjs/common';
import { ErrorBaseDatos } from '../../../common/filters/postgrest-error.filter';
import { llamarRpc } from '../../../infrastructure/database/rpc.helper';
import {
  SUPABASE_SERVICE_CLIENT,
  type SupabaseServiceClient,
} from '../../../infrastructure/database/supabase-service-client.provider';
import { SupabaseUserClientFactory } from '../../../infrastructure/database/supabase-user-client.factory';
import type { CanalContacto } from '../../../shared/types/enums';
import type {
  CambiosContacto,
  ContactoCliente,
  ContactoClienteRepository,
} from '../domain/contacto-cliente.repository.port';

interface FilaCliente {
  nombres: string;
  apellidos: string;
  telefono: string;
  email: string | null;
  canal_preferido: CanalContacto;
}

@Injectable()
export class ContactoClienteSupabaseRepository implements ContactoClienteRepository {
  constructor(
    @Inject(SUPABASE_SERVICE_CLIENT)
    private readonly servicio: SupabaseServiceClient,
    private readonly clientes: SupabaseUserClientFactory,
  ) {}

  async actualizar(usuarioId: string, cambios: CambiosContacto): Promise<void> {
    // `null` = no tocar (el RPC usa coalesce): nombres y apellidos nunca se envían.
    await llamarRpc(this.servicio, 'vincular_cliente', {
      p_usuario_id: usuarioId,
      p_contacto: {
        telefono: cambios.telefono ?? null,
        canal_preferido: cambios.canal ?? null,
      },
    });
  }

  async deUsuario(
    accessToken: string,
    usuarioId: string,
  ): Promise<ContactoCliente | null> {
    const { data, error } = await this.clientes
      .paraToken(accessToken)
      .from('cliente')
      .select('nombres, apellidos, telefono, email, canal_preferido')
      .eq('usuario_id', usuarioId)
      .maybeSingle();
    if (error) throw new ErrorBaseDatos(error);
    if (!data) return null;
    const f = data as FilaCliente;
    return {
      nombres: f.nombres,
      apellidos: f.apellidos,
      telefono: f.telefono,
      email: f.email,
      canal: f.canal_preferido,
    };
  }
}

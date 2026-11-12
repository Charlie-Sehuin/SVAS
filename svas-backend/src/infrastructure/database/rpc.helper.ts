import { ErrorBaseDatos } from '../../common/filters/postgrest-error.filter';
import type { SupabaseServiceClient } from './supabase-service-client.provider';
import type { SupabaseUserClient } from './supabase-user-client.factory';

/**
 * Llama un RPC de `svas` y convierte `{ error }` en ErrorBaseDatos
 * (arquitectura backend §3.4): HttpExceptionFilter lo traduce a 400/403/404/409.
 * Con el cliente de usuario corre como él (auth.uid()); con el de servicio,
 * como service_role.
 */
export async function llamarRpc<T>(
  cliente: SupabaseUserClient | SupabaseServiceClient,
  nombre: string,
  params: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await (cliente as SupabaseServiceClient).rpc(
    nombre,
    params,
  );
  if (error) throw new ErrorBaseDatos(error);
  return data as T;
}

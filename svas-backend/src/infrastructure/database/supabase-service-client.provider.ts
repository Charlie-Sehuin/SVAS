import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import type { Env } from '../../config/env.validation';

/**
 * Cliente con service_role (arquitectura backend §4.2): ignora RLS.
 * Solo para flujos públicos ya validados por el backend, jobs, lectura de
 * tarifas y health checks. Nunca se inyecta en domain/ ni presentation/ de
 * los módulos de negocio.
 */
export const SUPABASE_SERVICE_CLIENT = Symbol('SUPABASE_SERVICE_CLIENT');

export function crearClienteServicio(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'svas' },
  });
}

export type SupabaseServiceClient = ReturnType<typeof crearClienteServicio>;

export const supabaseServiceClientProvider: Provider = {
  provide: SUPABASE_SERVICE_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) =>
    crearClienteServicio(
      config.get('SUPABASE_URL', { infer: true }),
      config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true }),
    ),
};

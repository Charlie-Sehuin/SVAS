import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import type { Env } from '../../config/env.validation';

function crearClienteUsuario(
  url: string,
  anonKey: string,
  accessToken: string,
) {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'svas' },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export type SupabaseUserClient = ReturnType<typeof crearClienteUsuario>;

/**
 * Cliente de usuario (arquitectura backend §4.2): anon key + JWT del usuario.
 * Se crea por request; RLS y auth.uid() aplican. Es el cliente por defecto
 * para todo lo que hace un usuario autenticado (incluidos los RPC admin).
 */
@Injectable()
export class SupabaseUserClientFactory {
  private readonly url: string;
  private readonly anonKey: string;

  constructor(config: ConfigService<Env, true>) {
    this.url = config.get('SUPABASE_URL', { infer: true });
    this.anonKey = config.get('SUPABASE_ANON_KEY', { infer: true });
  }

  paraToken(accessToken: string): SupabaseUserClient {
    return crearClienteUsuario(this.url, this.anonKey, accessToken);
  }
}

import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import type { Env } from '../../config/env.validation';
import {
  SUPABASE_SERVICE_CLIENT,
  type SupabaseServiceClient,
} from '../database/supabase-service-client.provider';

type Estado = 'up' | 'down';
const TIMEOUT_MS = 3000;

/**
 * /health/live  → el proceso responde (Railway lo usa para reiniciar).
 * /health/ready → además Postgres (esquema svas) y Supabase Auth responden (RNF-04).
 * Públicas: Railway y el smoke test las llaman sin JWT.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(SUPABASE_SERVICE_CLIENT) private readonly db: SupabaseServiceClient,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    const [database, auth] = await Promise.all([
      this.verificarBaseDatos(),
      this.verificarAuth(),
    ]);
    const cuerpo = {
      status: database === 'up' && auth === 'up' ? 'ok' : 'error',
      checks: { database, auth },
    };
    if (cuerpo.status !== 'ok') {
      throw new ServiceUnavailableException(
        `Servicio no disponible (database: ${database}, auth: ${auth})`,
      );
    }
    return cuerpo;
  }

  private async verificarBaseDatos(): Promise<Estado> {
    try {
      const { error } = await this.db
        .from('usuario')
        .select('id')
        .limit(1)
        .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
      return error ? 'down' : 'up';
    } catch {
      return 'down';
    }
  }

  private async verificarAuth(): Promise<Estado> {
    try {
      const url = this.config.get('SUPABASE_URL', { infer: true });
      const res = await fetch(`${url}/auth/v1/health`, {
        headers: {
          apikey: this.config.get('SUPABASE_ANON_KEY', { infer: true }),
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return res.ok ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}

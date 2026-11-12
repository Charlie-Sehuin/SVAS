import { z } from 'zod';

/**
 * Variables de entorno (arquitectura backend §3.3).
 * Ajuste: el proyecto usa JWT Signing Keys (ES256), así que en lugar de
 * SUPABASE_JWT_SECRET se valida SUPABASE_JWKS_URL.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_URL: z.url().default('http://localhost:5173'),
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWKS_URL: z.url(),
});

export type Env = z.infer<typeof envSchema>;

/** Usado por ConfigModule: la app no arranca si falta o es inválida una variable. */
export function validateEnv(config: Record<string, unknown>): Env {
  const resultado = envSchema.safeParse(config);
  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas:\n${detalle}`);
  }
  return resultado.data;
}

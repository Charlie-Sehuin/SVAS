import { z } from 'zod';

/**
 * Variables de entorno (arquitectura backend §3.3).
 * Ajuste: el proyecto usa JWT Signing Keys (ES256), así que en lugar de
 * SUPABASE_JWT_SECRET se valida SUPABASE_JWKS_URL.
 */
export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    FRONTEND_URL: z.url().default('http://localhost:5173'),
    SUPABASE_URL: z.url(),
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SUPABASE_JWKS_URL: z.url(),
    // Opcionales
    FEATURE_CLASIFICADOR_LLM: z.stringbool().default(false),
    // Vacía (ANTHROPIC_API_KEY= en el .env) cuenta como no definida.
    ANTHROPIC_API_KEY: z.string().optional(),
    // Reconocimiento de vehículo por foto: sin clave se usa el reconocedor simulado.
    GEMINI_API_KEY: z.string().trim().optional(),
    GEMINI_MODEL: z.string().trim().min(1).default('gemini-2.5-flash'),
    // Respaldo del chatbot si Gemini falla (o proveedor único si no hay GEMINI_API_KEY). Sin clave, no se usa.
    DEEPSEEK_API_KEY: z.string().trim().optional(),
    DEEPSEEK_MODEL: z.string().trim().min(1).default('deepseek-v4-flash'),
    // Modelo de DeepSeek con visión, para leer la tarjeta de propiedad (DeepSeek principal, Gemini de respaldo).
    DEEPSEEK_MODEL_VISION: z.string().trim().min(1).default('deepseek-flash'),
    // Correo de la póliza (PDF adjunto) con Resend: sin clave, el envío es simulado.
    RESEND_API_KEY: z.string().trim().optional(),
    // Remitente. Sin dominio verificado en Resend solo sirve onboarding@resend.dev, que entrega únicamente
    // al correo de la cuenta dueña de la clave; para enviar a clientes hay que verificar un dominio.
    CORREO_REMITENTE: z
      .string()
      .trim()
      .min(3)
      .default('SeguroSimple <onboarding@resend.dev>'),
  })
  .refine((env) => !env.FEATURE_CLASIFICADOR_LLM || env.ANTHROPIC_API_KEY, {
    path: ['ANTHROPIC_API_KEY'],
    message: 'es obligatoria cuando FEATURE_CLASIFICADOR_LLM=true',
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

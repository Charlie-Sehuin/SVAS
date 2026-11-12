import { validateEnv } from './env.validation';

const base = {
  SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_x',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x',
  SUPABASE_JWKS_URL:
    'https://abcdefghijklmnopqrst.supabase.co/auth/v1/.well-known/jwks.json',
};

describe('validateEnv', () => {
  it('aplica valores por defecto', () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.FRONTEND_URL).toBe('http://localhost:5173');
  });

  it('convierte PORT a número', () => {
    expect(validateEnv({ ...base, PORT: '8080' }).PORT).toBe(8080);
  });

  it('falla si falta una variable obligatoria y la nombra', () => {
    const { SUPABASE_SERVICE_ROLE_KEY: _omitida, ...sinClave } = base;
    expect(() => validateEnv(sinClave)).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('falla si SUPABASE_URL no es una URL', () => {
    expect(() => validateEnv({ ...base, SUPABASE_URL: 'no-es-url' })).toThrow(
      /SUPABASE_URL/,
    );
  });
});

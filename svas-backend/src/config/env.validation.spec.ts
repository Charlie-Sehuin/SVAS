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

  it('FEATURE_CLASIFICADOR_LLM es false por defecto y acepta "true"/"false"', () => {
    expect(validateEnv(base).FEATURE_CLASIFICADOR_LLM).toBe(false);
    expect(
      validateEnv({
        ...base,
        FEATURE_CLASIFICADOR_LLM: 'true',
        ANTHROPIC_API_KEY: 'k',
      }).FEATURE_CLASIFICADOR_LLM,
    ).toBe(true);
  });

  it('exige ANTHROPIC_API_KEY si el clasificador LLM está activo', () => {
    expect(() =>
      validateEnv({ ...base, FEATURE_CLASIFICADOR_LLM: 'true' }),
    ).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('arranca con el .env.example copiado tal cual (ANTHROPIC_API_KEY vacía)', () => {
    expect(() =>
      validateEnv({
        ...base,
        FEATURE_CLASIFICADOR_LLM: 'false',
        ANTHROPIC_API_KEY: '',
      }),
    ).not.toThrow();
    expect(() =>
      validateEnv({
        ...base,
        FEATURE_CLASIFICADOR_LLM: 'true',
        ANTHROPIC_API_KEY: '',
      }),
    ).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('falla si SUPABASE_URL no es una URL', () => {
    expect(() => validateEnv({ ...base, SUPABASE_URL: 'no-es-url' })).toThrow(
      /SUPABASE_URL/,
    );
  });
});

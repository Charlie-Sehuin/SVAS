/**
 * Verifica que las variables de Supabase del .env sean correctas.
 * Nunca imprime las claves.
 *
 * Uso: npm run verificar-env
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

let fallas = 0;
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const mal = (msg: string, pista?: string) => {
  fallas++;
  console.log(`  ✗ ${msg}`);
  if (pista) console.log(`      → ${pista}`);
};

/** Para claves legacy (JWT): devuelve el payload; para claves nuevas (sb_...) devuelve null. */
function payloadJwt(clave: string): Record<string, unknown> | null {
  const partes = clave.split('.');
  if (partes.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWKS_URL } = process.env;
const DASH = 'Dashboard → Project Settings → API Keys / Data API';

// ── 1. SUPABASE_URL ─────────────────────────────────────────────────────────
console.log('\n1. SUPABASE_URL');
let ref: string | undefined;
if (!SUPABASE_URL) {
  mal('No está definida', `Cópiala de ${DASH} (Project URL)`);
} else {
  const m = SUPABASE_URL.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/);
  if (!m) {
    mal('Formato inesperado', 'Debe ser https://<ref>.supabase.co, sin /rest/v1 ni / al final');
  } else {
    ref = m[1];
    ok(`Formato correcto (ref: ${ref})`);
    try {
      const refLinkeado = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
      if (refLinkeado === ref) ok('Coincide con el proyecto linkeado por el CLI');
      else mal(`No coincide con el proyecto linkeado (${refLinkeado})`, 'El .env apunta a otro proyecto');
    } catch {
      /* sin link local: se omite */
    }
  }
}

// ── 2. SUPABASE_ANON_KEY ────────────────────────────────────────────────────
console.log('\n2. SUPABASE_ANON_KEY (pública)');
if (!SUPABASE_ANON_KEY) {
  mal('No está definida', `${DASH}: "anon public" o "publishable key"`);
} else {
  const p = payloadJwt(SUPABASE_ANON_KEY);
  if (SUPABASE_ANON_KEY.startsWith('sb_secret_')) {
    mal('¡Es una clave SECRETA!', 'Aquí va la publishable (sb_publishable_...) o la anon');
  } else if (p && p.role !== 'anon') {
    mal(`El JWT tiene role="${p.role}", se esperaba "anon"`, '¿Intercambiaste anon y service_role?');
  } else if (p && ref && p.ref !== ref) {
    mal(`Es de otro proyecto (ref ${p.ref})`);
  } else {
    ok(p ? 'JWT legacy con role=anon' : 'Clave publishable (formato nuevo)');
  }
  if (SUPABASE_URL) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } });
    if (r.ok) ok('Supabase la acepta (Auth respondió 200)');
    else mal(`Supabase la rechaza (HTTP ${r.status})`, 'Vuelve a copiarla completa del dashboard');
  }
}

// ── 3. SUPABASE_SERVICE_ROLE_KEY ────────────────────────────────────────────
console.log('\n3. SUPABASE_SERVICE_ROLE_KEY (secreta)');
if (!SUPABASE_SERVICE_ROLE_KEY) {
  mal('No está definida', `${DASH}: "service_role" o "secret key"`);
} else {
  const p = payloadJwt(SUPABASE_SERVICE_ROLE_KEY);
  if (SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_publishable_')) {
    mal('Es la clave PÚBLICA', 'Aquí va la secret (sb_secret_...) o la service_role');
  } else if (p && p.role !== 'service_role') {
    mal(`El JWT tiene role="${p.role}", se esperaba "service_role"`);
  } else if (SUPABASE_ANON_KEY && SUPABASE_ANON_KEY === SUPABASE_SERVICE_ROLE_KEY) {
    mal('Es idéntica a la ANON_KEY');
  } else {
    ok(p ? 'JWT legacy con role=service_role' : 'Clave secret (formato nuevo)');
  }

  if (SUPABASE_URL) {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: 'svas' },
    });
    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (!error) ok('Tiene permisos de administrador (puede listar usuarios de Auth)');
    else mal(`No tiene permisos de admin: ${error.message}`, 'Probablemente pegaste la anon/publishable');

    // ── 4. Esquema svas expuesto + migraciones aplicadas ──
    console.log('\n4. Esquema svas (Data API)');
    const { count, error: e2 } = await admin.from('usuario').select('id', { count: 'exact' }).limit(1);
    if (!e2) {
      ok('El esquema svas está expuesto y la tabla usuario existe');
      if (count === 0) console.log('  · svas.usuario está vacía → corre npm run crear-admin');
      else ok(`svas.usuario tiene ${count} fila(s)`);
    } else if (e2.code === 'PGRST106' || /schema/i.test(e2.message)) {
      mal('El esquema svas NO está expuesto', 'Dashboard → Settings → Data API → Exposed schemas → agrega "svas"');
    } else if (e2.code === 'PGRST205' || e2.code === '42P01') {
      mal('La tabla svas.usuario no existe', 'Corre: npx supabase db push --remote');
    } else {
      mal(`Error consultando svas.usuario: ${e2.message} (${e2.code ?? 's/c'})`);
    }
  }
}

// ── 5. SUPABASE_JWKS_URL ────────────────────────────────────────────────────
console.log('\n5. SUPABASE_JWKS_URL');
if (!SUPABASE_JWKS_URL) {
  mal('No está definida', `Debe ser ${SUPABASE_URL ?? 'https://<ref>.supabase.co'}/auth/v1/.well-known/jwks.json`);
} else {
  const esperado = SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json` : null;
  if (esperado && SUPABASE_JWKS_URL !== esperado) {
    mal('No coincide con la URL esperada', `Debería ser ${esperado}`);
  } else {
    ok('URL con el formato esperado');
  }
  try {
    const r = await fetch(SUPABASE_JWKS_URL);
    const body = (await r.json()) as { keys?: Array<{ alg?: string }> };
    if (!r.ok) mal(`HTTP ${r.status} al descargar el JWKS`);
    else if (!body.keys?.length)
      mal('El JWKS está vacío', 'Tu proyecto aún firma con el JWT secret legacy (HS256): activa las JWT Signing Keys o usa SUPABASE_JWT_SECRET');
    else ok(`JWKS con ${body.keys.length} clave(s) (${body.keys.map((k) => k.alg).join(', ')})`);
  } catch (e) {
    mal(`No se pudo descargar: ${(e as Error).message}`);
  }
}

console.log(fallas === 0 ? '\nTodo correcto ✅\n' : `\n${fallas} problema(s) encontrado(s) ❌\n`);
process.exit(fallas === 0 ? 0 : 1);

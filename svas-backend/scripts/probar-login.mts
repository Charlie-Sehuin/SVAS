/**
 * Inicia sesión con Supabase Auth y llama a GET /api/v1/dev/whoami del backend
 * local, para probar SupabaseAuthGuard + RolesGuard de punta a punta.
 *
 * Uso (con el backend corriendo en otra terminal: npm run start:dev):
 *   npm run probar-login -- --email tu@correo.com
 *
 * Pide la contraseña por consola (no queda en el historial). También acepta
 * la variable SVAS_PASSWORD. Con --token imprime el access_token para usarlo
 * en Swagger/Postman.
 */
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';

const { values } = parseArgs({
  options: { email: { type: 'string' }, token: { type: 'boolean', default: false } },
});

const email = values.email?.trim();
if (!email) {
  console.error('Falta --email <correo>');
  process.exit(1);
}

const { SUPABASE_URL, SUPABASE_ANON_KEY, PORT = '3000' } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY en el .env');
  process.exit(1);
}

let password = process.env.SVAS_PASSWORD;
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question('Contraseña: ');
  rl.close();
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error || !data.session) {
  console.error(`✗ Login fallido: ${error?.message}`);
  process.exit(1);
}
console.log('✓ Login correcto en Supabase Auth');

const token = data.session.access_token;
if (values.token) console.log(`\naccess_token:\n${token}\n`);

const url = `http://localhost:${PORT}/api/v1/dev/whoami`;
try {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  console.log(`\nGET ${url} → ${res.status}`);
  console.log(JSON.stringify(await res.json(), null, 2));
} catch {
  console.error(`\n✗ No se pudo conectar a ${url}. ¿Está corriendo npm run start:dev?`);
  process.exit(1);
}

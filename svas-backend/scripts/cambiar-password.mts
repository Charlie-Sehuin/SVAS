/**
 * Cambia la contraseña de un usuario existente (p. ej. si se filtró).
 *
 * Uso:
 *   npm run cambiar-password -- --email admin@dominio.com
 *
 * Genera una contraseña nueva y la muestra UNA sola vez.
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const { values } = parseArgs({ options: { email: { type: 'string' } } });
const email = values.email?.trim().toLowerCase();
if (!email) {
  console.error('Falta el argumento: --email <correo>');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno (.env).');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'svas' },
});

const { data: usuario, error } = await supabase
  .from('usuario')
  .select('id')
  .eq('email', email)
  .maybeSingle();
if (error || !usuario) {
  console.error(`No existe un usuario con ese email${error ? `: ${error.message}` : ''}.`);
  process.exit(1);
}

const password = randomBytes(18).toString('base64url');
const { error: errorAuth } = await supabase.auth.admin.updateUserById(usuario.id, { password });
if (errorAuth) {
  console.error(`No se pudo cambiar la contraseña: ${errorAuth.message}`);
  process.exit(1);
}

console.log('✓ Contraseña cambiada.');
console.log(`  Nueva contraseña (cópiala ahora, no se vuelve a mostrar): ${password}`);
console.log('  Guárdala en svas-backend/bruno/.env (ADMIN_PASSWORD=...).');

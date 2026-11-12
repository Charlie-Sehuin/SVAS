/**
 * Crea el primer ADMINISTRADOR (arquitectura backend §10.1.1, paso 5).
 *
 * Uso:
 *   npm run crear-admin -- --email admin@dominio.com --nombre "Nombre Apellido"
 *
 * La contraseña se lee de ADMIN_PASSWORD; si no existe, se genera una y se
 * muestra una sola vez. Requiere el esquema `svas` expuesto en API settings.
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    nombre: { type: 'string' },
  },
});

const email = values.email?.trim().toLowerCase();
const nombre = values.nombre?.trim();
if (!email || !nombre) {
  console.error('Faltan argumentos: --email <correo> --nombre "<nombre completo>"');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno (.env).');
  process.exit(1);
}

const passwordGenerada = !process.env.ADMIN_PASSWORD;
const password = process.env.ADMIN_PASSWORD ?? randomBytes(18).toString('base64url');

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'svas' },
});

const { data: creado, error: errorAuth } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (errorAuth || !creado.user) {
  console.error(`No se pudo crear el usuario en Auth: ${errorAuth?.message}`);
  process.exit(1);
}
const userId = creado.user.id;

// tg_usuario_sync_rol copia el rol a app_metadata.roles.
const { error: errorUsuario } = await supabase
  .from('usuario')
  .insert({ id: userId, email, nombre_completo: nombre, rol: 'ADMINISTRADOR', activo: true });

if (errorUsuario) {
  // Compensación: no dejar una cuenta de Auth sin perfil de negocio.
  await supabase.auth.admin.deleteUser(userId);
  console.error(`No se pudo crear svas.usuario (se revirtió Auth): ${errorUsuario.message}`);
  if (errorUsuario.message.includes('schema')) {
    console.error('¿Expusiste el esquema "svas" en Settings → API → Exposed schemas?');
  }
  process.exit(1);
}

const { error: errorLog } = await supabase.from('registro_actividad').insert({
  usuario_id: null,
  accion: 'CREAR_ADMINISTRADOR',
  entidad: 'usuario',
  entidad_id: userId,
  detalle: { email, origen: 'scripts/crear-admin.ts' },
});
if (errorLog) console.warn(`Admin creado, pero no se registró en la bitácora: ${errorLog.message}`);

console.log(`ADMINISTRADOR creado: ${email} (${userId})`);
if (passwordGenerada) {
  console.log(`Contraseña generada (guárdala, no se vuelve a mostrar): ${password}`);
}

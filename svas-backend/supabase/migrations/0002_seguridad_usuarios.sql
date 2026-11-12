-- 0002 · usuario, tg_usuario_sync_rol, svas.rol_actual(), svas.exigir_rol()
-- Fuente: contexto §4.1 (D2), §6 (patrón de RPC), §7 (roles y RLS); backend §4.1

-- ── Tabla ───────────────────────────────────────────────────────────────────
create table svas.usuario (
  id              uuid primary key references auth.users (id) on delete restrict,
  email           varchar(254) not null,
  rol             svas.rol not null default 'CLIENTE',
  nombre_completo varchar(160) not null,
  activo          boolean not null default true,
  constraint uq_usuario_email unique (email),
  constraint ck_usuario_email check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

comment on table svas.usuario is
  'Perfil de negocio de cada cuenta de Supabase Auth. La contraseña vive en auth.users (bcrypt).';

-- ── Sincronización del rol al JWT (app_metadata.roles, nunca user_metadata) ─
create or replace function svas.fn_usuario_sync_rol()
returns trigger
language plpgsql
security definer
set search_path = svas, public
as $$
begin
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || jsonb_build_object('roles', jsonb_build_array(new.rol::text))
   where id = new.id;
  return new;
end;
$$;

create trigger tg_usuario_sync_rol
after insert or update of rol on svas.usuario
for each row execute function svas.fn_usuario_sync_rol();

revoke execute on function svas.fn_usuario_sync_rol() from public, anon, authenticated;

-- ── Helpers de autorización ─────────────────────────────────────────────────
-- Rol de negocio del usuario autenticado (null si no existe o está inactivo).
create or replace function svas.rol_actual()
returns svas.rol
language sql
stable
security definer
set search_path = svas, public
as $$
  select u.rol
    from svas.usuario u
   where u.id = auth.uid()
     and u.activo = true;
$$;

-- Primera línea de todo RPC de usuarios autenticados:
--   perform svas.exigir_rol(array['ASESOR','ADMINISTRADOR']);
-- SECURITY DEFINER no está sujeto a RLS: esta es la barrera real.
create or replace function svas.exigir_rol(p_roles text[])
returns void
language plpgsql
stable
security definer
set search_path = svas, public
as $$
declare
  v_rol svas.rol;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para realizar esta acción'
      using errcode = '42501';
  end if;

  v_rol := svas.rol_actual();

  if v_rol is null then
    raise exception 'Tu usuario no existe o está desactivado'
      using errcode = '42501';
  end if;

  if not (v_rol::text = any (p_roles)) then
    raise exception 'No tienes permiso para realizar esta acción'
      using errcode = '42501';
  end if;
end;
$$;

revoke execute on function svas.rol_actual() from public, anon;
revoke execute on function svas.exigir_rol(text[]) from public, anon;
grant execute on function svas.rol_actual() to authenticated, service_role;
grant execute on function svas.exigir_rol(text[]) to authenticated, service_role;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table svas.usuario enable row level security;

-- Lectura: el propio usuario o un ADMINISTRADOR.
create policy usuario_select on svas.usuario
  for select to authenticated
  using (id = auth.uid() or svas.rol_actual() = 'ADMINISTRADOR');

-- Sin policies de INSERT/UPDATE/DELETE para authenticated: la escritura va
-- por el backend (service_role) o por RPC admin (admin_cambiar_rol_usuario).

revoke all on svas.usuario from public, anon, authenticated;
grant select on svas.usuario to authenticated;
grant select, insert, update on svas.usuario to service_role;

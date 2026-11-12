-- 0022 · RPCs de administración de usuarios (módulo seguridad, Ola 0)
-- Fuente: contexto §6 (patrón), §6.12 (admin_cambiar_rol_usuario), §7.
-- Nota: el doc ubica admin_cambiar_rol_usuario en 0015, pero 0015 agrupa RPCs
-- de catálogo/tarifas cuyas tablas aún no existen y una migración aplicada no
-- se edita; por eso los RPCs de usuarios van en su propia migración.
--
-- Reglas comunes:
--   · Solo ADMINISTRADOR activo (svas.exigir_rol), validado con auth.uid().
--   · Nadie se cambia el rol ni el estado a sí mismo.
--   · Siempre queda al menos un ADMINISTRADOR activo.
--   · Cada cambio deja antes/después en registro_actividad.
--   · Se bloquean las filas de administradores ANTES de validar el rol del que
--     llama: dos admins que se degradan mutuamente a la vez se serializan y el
--     segundo ya no pasa exigir_rol.

-- ── Helper interno ──────────────────────────────────────────────────────────
create or replace function svas._bloquear_administradores()
returns void
language plpgsql
security definer
set search_path = svas, public
as $$
begin
  -- PERFORM recorre todas las filas: bloquea a todos los administradores.
  perform 1 from svas.usuario where rol = 'ADMINISTRADOR' for update;
end;
$$;

revoke execute on function svas._bloquear_administradores() from public, anon, authenticated;

create or replace function svas._usuario_json(u svas.usuario)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', u.id, 'email', u.email, 'rol', u.rol,
    'nombre_completo', u.nombre_completo, 'activo', u.activo
  );
$$;

revoke execute on function svas._usuario_json(svas.usuario) from public, anon, authenticated;

-- ── Crear usuario interno (ASESOR / ADMINISTRADOR) ──────────────────────────
-- El backend crea antes la cuenta en Supabase Auth (Admin API) y aquí registra
-- el perfil de negocio y la bitácora en una sola transacción.
create or replace function svas.admin_registrar_usuario_interno(
  p_usuario_id uuid,
  p_email text,
  p_nombre_completo text,
  p_rol svas.rol
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_nuevo svas.usuario;
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);

  if p_rol = 'CLIENTE' then
    raise exception 'Los clientes se registran desde el embudo, no desde administración';
  end if;

  insert into svas.usuario (id, email, rol, nombre_completo, activo)
  values (p_usuario_id, lower(trim(p_email)), p_rol, trim(p_nombre_completo), true)
  returning * into v_nuevo;

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'CREAR_USUARIO', 'usuario', v_nuevo.id,
          jsonb_build_object('despues', svas._usuario_json(v_nuevo)));

  return svas._usuario_json(v_nuevo);
end;
$$;

-- ── Cambiar rol ─────────────────────────────────────────────────────────────
create or replace function svas.admin_cambiar_rol_usuario(
  p_usuario_id uuid,
  p_rol svas.rol
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_antes   svas.usuario;
  v_despues svas.usuario;
begin
  perform svas._bloquear_administradores();
  perform svas.exigir_rol(array['ADMINISTRADOR']);

  if p_usuario_id = auth.uid() then
    raise exception 'No puedes cambiar tu propio rol';
  end if;

  select * into v_antes from svas.usuario where id = p_usuario_id for update;
  if not found then
    raise exception 'El usuario no existe' using errcode = 'P0002';
  end if;

  if v_antes.rol = 'CLIENTE' or p_rol = 'CLIENTE' then
    raise exception 'Solo se puede cambiar el rol entre ASESOR y ADMINISTRADOR';
  end if;

  if v_antes.rol = p_rol then
    return svas._usuario_json(v_antes); -- idempotente: sin cambio, sin bitácora
  end if;

  if v_antes.rol = 'ADMINISTRADOR' and v_antes.activo and not exists (
    select 1 from svas.usuario
     where rol = 'ADMINISTRADOR' and activo and id <> p_usuario_id
  ) then
    raise exception 'Debe quedar al menos un administrador activo';
  end if;

  update svas.usuario set rol = p_rol where id = p_usuario_id
  returning * into v_despues; -- tg_usuario_sync_rol actualiza app_metadata.roles

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'CAMBIAR_ROL_USUARIO', 'usuario', p_usuario_id,
          jsonb_build_object('antes', jsonb_build_object('rol', v_antes.rol),
                             'despues', jsonb_build_object('rol', v_despues.rol)));

  return svas._usuario_json(v_despues);
end;
$$;

-- ── Activar / desactivar ────────────────────────────────────────────────────
create or replace function svas.admin_cambiar_estado_usuario(
  p_usuario_id uuid,
  p_activo boolean
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_antes   svas.usuario;
  v_despues svas.usuario;
begin
  perform svas._bloquear_administradores();
  perform svas.exigir_rol(array['ADMINISTRADOR']);

  if p_usuario_id = auth.uid() then
    raise exception 'No puedes cambiar tu propio estado';
  end if;

  select * into v_antes from svas.usuario where id = p_usuario_id for update;
  if not found then
    raise exception 'El usuario no existe' using errcode = 'P0002';
  end if;

  if v_antes.activo = p_activo then
    return svas._usuario_json(v_antes); -- idempotente
  end if;

  if not p_activo and v_antes.rol = 'ADMINISTRADOR' and not exists (
    select 1 from svas.usuario
     where rol = 'ADMINISTRADOR' and activo and id <> p_usuario_id
  ) then
    raise exception 'Debe quedar al menos un administrador activo';
  end if;

  update svas.usuario set activo = p_activo where id = p_usuario_id
  returning * into v_despues;

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(),
          case when p_activo then 'ACTIVAR_USUARIO' else 'DESACTIVAR_USUARIO' end,
          'usuario', p_usuario_id,
          jsonb_build_object('antes', jsonb_build_object('activo', v_antes.activo),
                             'despues', jsonb_build_object('activo', v_despues.activo)));

  return svas._usuario_json(v_despues);
end;
$$;

-- ── Permisos: solo usuarios autenticados (el rol lo valida exigir_rol) ──────
revoke execute on function svas.admin_registrar_usuario_interno(uuid, text, text, svas.rol) from public, anon;
revoke execute on function svas.admin_cambiar_rol_usuario(uuid, svas.rol) from public, anon;
revoke execute on function svas.admin_cambiar_estado_usuario(uuid, boolean) from public, anon;

grant execute on function svas.admin_registrar_usuario_interno(uuid, text, text, svas.rol) to authenticated;
grant execute on function svas.admin_cambiar_rol_usuario(uuid, svas.rol) to authenticated;
grant execute on function svas.admin_cambiar_estado_usuario(uuid, boolean) to authenticated;

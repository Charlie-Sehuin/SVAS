-- 0015 · RPCs de administración del catálogo (módulo administracion, Ola 0)
-- Fuente: contexto §6.12, §5 (RN-16, RN-17, RN-25, RNF-12), §7.
-- Nota: el doc agrupa aquí también los RPCs de tarifas, pero sus tablas (0006)
-- aún no existen y una migración aplicada no se edita: van en su propia
-- migración junto con 0005/0006. admin_cambiar_rol_usuario está en 0022.
-- admin_cambiar_estado_plan se reemplaza en 0020 para exigir contenido completo (RN-42).
--
-- Reglas comunes:
--   · Primera línea: svas.exigir_rol(array['ADMINISTRADOR']).
--   · Cada cambio deja antes/después en registro_actividad (RNF-12).
--   · Sin cambio real → idempotente, sin bitácora.
--   · RN-16: desactivar, no borrar.

-- ── Parámetros comerciales ──────────────────────────────────────────────────
-- p_cambios: objeto parcial con claves snake_case de parametros_comerciales.
create or replace function svas.admin_actualizar_parametros(p_cambios jsonb)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_antes   svas.parametros_comerciales;
  v_despues svas.parametros_comerciales;
  v_clave   text;
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);

  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' or p_cambios = '{}'::jsonb then
    raise exception 'Indica al menos un parámetro a cambiar';
  end if;

  select k into v_clave
    from jsonb_object_keys(p_cambios) k
   where k <> all (array['descuento_primera_compra', 'descuento_maximo', 'max_intentos',
                         'dias_seguimiento', 'max_cuotas', 'vigencia_enlace_dias',
                         'horas_abandono', 'moneda', 'tipo_cambio_referencial'])
   limit 1;
  if v_clave is not null then
    raise exception 'El parámetro % no existe', v_clave;
  end if;

  select * into v_antes from svas.parametros_comerciales where id = 1 for update;
  if not found then
    raise exception 'Faltan los parámetros comerciales' using errcode = 'P0002';
  end if;

  update svas.parametros_comerciales set
    descuento_primera_compra = coalesce((p_cambios->>'descuento_primera_compra')::numeric, descuento_primera_compra),
    descuento_maximo         = coalesce((p_cambios->>'descuento_maximo')::numeric, descuento_maximo),
    max_intentos             = coalesce((p_cambios->>'max_intentos')::smallint, max_intentos),
    dias_seguimiento         = coalesce((p_cambios->>'dias_seguimiento')::smallint, dias_seguimiento),
    max_cuotas               = coalesce((p_cambios->>'max_cuotas')::smallint, max_cuotas),
    vigencia_enlace_dias     = coalesce((p_cambios->>'vigencia_enlace_dias')::smallint, vigencia_enlace_dias),
    horas_abandono           = coalesce((p_cambios->>'horas_abandono')::smallint, horas_abandono),
    moneda                   = coalesce(upper(p_cambios->>'moneda'), moneda),
    tipo_cambio_referencial  = coalesce((p_cambios->>'tipo_cambio_referencial')::numeric, tipo_cambio_referencial)
  where id = 1
  returning * into v_despues;

  if to_jsonb(v_antes) <> to_jsonb(v_despues) then
    insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(), 'ACTUALIZAR_PARAMETROS', 'parametros_comerciales', null,
            jsonb_build_object('antes', to_jsonb(v_antes), 'despues', to_jsonb(v_despues)));
  end if;

  return to_jsonb(v_despues);
end;
$$;

-- ── Aseguradora: activar / desactivar ───────────────────────────────────────
create or replace function svas.admin_cambiar_estado_aseguradora(
  p_aseguradora_id uuid,
  p_activa boolean
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_antes   svas.aseguradora;
  v_despues svas.aseguradora;
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);

  -- Bloquea todas las aseguradoras: dos desactivaciones simultáneas se serializan.
  perform 1 from svas.aseguradora for update;

  select * into v_antes from svas.aseguradora where id = p_aseguradora_id;
  if not found then
    raise exception 'La aseguradora no existe' using errcode = 'P0002';
  end if;

  if v_antes.activa = p_activa then
    return to_jsonb(v_antes);
  end if;

  if not p_activa and not exists (
    select 1 from svas.aseguradora where activa and id <> p_aseguradora_id
  ) then
    raise exception 'Debe quedar al menos una aseguradora activa';
  end if;

  update svas.aseguradora set activa = p_activa where id = p_aseguradora_id
  returning * into v_despues;

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(),
          case when p_activa then 'ACTIVAR_ASEGURADORA' else 'DESACTIVAR_ASEGURADORA' end,
          'aseguradora', p_aseguradora_id,
          jsonb_build_object('antes', jsonb_build_object('activa', v_antes.activa),
                             'despues', jsonb_build_object('activa', v_despues.activa)));

  return to_jsonb(v_despues);
end;
$$;

-- ── Plan: crear / editar nombre y descripción ───────────────────────────────
-- p_plan_id null → crea (inactivo: se activa cuando tenga tarifa y contenido).
-- p_aseguradora_id solo se usa al crear.
create or replace function svas.admin_guardar_plan(
  p_plan_id uuid,
  p_aseguradora_id uuid,
  p_nombre text,
  p_descripcion text
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_antes   svas.plan;
  v_despues svas.plan;
  v_nombre  text := nullif(trim(p_nombre), '');
  v_desc    text := nullif(trim(p_descripcion), '');
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);

  if v_nombre is null then
    raise exception 'Ingresa el nombre del plan';
  end if;

  if p_plan_id is null then
    if not exists (select 1 from svas.aseguradora where id = p_aseguradora_id) then
      raise exception 'La aseguradora no existe' using errcode = 'P0002';
    end if;

    insert into svas.plan (aseguradora_id, nombre, descripcion, activo)
    values (p_aseguradora_id, v_nombre, v_desc, false)
    returning * into v_despues;

    insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(), 'CREAR_PLAN', 'plan', v_despues.id,
            jsonb_build_object('despues', to_jsonb(v_despues)));

    return to_jsonb(v_despues);
  end if;

  select * into v_antes from svas.plan where id = p_plan_id for update;
  if not found then
    raise exception 'El plan no existe' using errcode = 'P0002';
  end if;

  update svas.plan set nombre = v_nombre, descripcion = v_desc where id = p_plan_id
  returning * into v_despues;

  if to_jsonb(v_antes) <> to_jsonb(v_despues) then
    insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(), 'EDITAR_PLAN', 'plan', p_plan_id,
            jsonb_build_object(
              'antes', jsonb_build_object('nombre', v_antes.nombre, 'descripcion', v_antes.descripcion),
              'despues', jsonb_build_object('nombre', v_despues.nombre, 'descripcion', v_despues.descripcion)));
  end if;

  return to_jsonb(v_despues);
end;
$$;

-- ── Plan: activar / desactivar ──────────────────────────────────────────────
create or replace function svas.admin_cambiar_estado_plan(
  p_plan_id uuid,
  p_activo boolean
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_antes   svas.plan;
  v_despues svas.plan;
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);

  select * into v_antes from svas.plan where id = p_plan_id for update;
  if not found then
    raise exception 'El plan no existe' using errcode = 'P0002';
  end if;

  if v_antes.activo = p_activo then
    return to_jsonb(v_antes);
  end if;

  update svas.plan set activo = p_activo where id = p_plan_id
  returning * into v_despues;

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(),
          case when p_activo then 'ACTIVAR_PLAN' else 'DESACTIVAR_PLAN' end,
          'plan', p_plan_id,
          jsonb_build_object('antes', jsonb_build_object('activo', v_antes.activo),
                             'despues', jsonb_build_object('activo', v_despues.activo)));

  return to_jsonb(v_despues);
end;
$$;

-- ── Campo requerido: crear / editar (con sus valores permitidos) ────────────
create or replace function svas._campo_json(p_campo_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = svas, public
as $$
  select to_jsonb(c) || jsonb_build_object(
           'valores', coalesce((select jsonb_agg(v.valor order by v.valor)
                                  from svas.valor_permitido v
                                 where v.campo_requerido_id = c.id), '[]'::jsonb))
    from svas.campo_requerido c
   where c.id = p_campo_id;
$$;

revoke execute on function svas._campo_json(uuid) from public, anon, authenticated;

-- p_campo_id null → crea (p_aseguradora_id obligatorio); si no, edita (la
-- aseguradora no cambia). p_valores reemplaza el conjunto de valor_permitido.
create or replace function svas.admin_guardar_campo(
  p_campo_id uuid,
  p_aseguradora_id uuid,
  p_nombre text,
  p_tipo svas.tipo_campo,
  p_obligatorio boolean,
  p_origen_valores text,
  p_valores text[],
  p_activo boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_antes   jsonb;
  v_despues jsonb;
  v_id      uuid := p_campo_id;
  v_nombre  text := lower(trim(p_nombre));
  v_origen  text := upper(coalesce(nullif(trim(p_origen_valores), ''), 'ESTATICO'));
  v_valores text[];
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);

  select coalesce(array_agg(distinct x order by x), '{}')
    into v_valores
    from (select trim(u) as x from unnest(coalesce(p_valores, '{}')) u) s
   where x <> '';

  if v_nombre is null or v_nombre = '' then
    raise exception 'Ingresa el nombre del campo';
  end if;

  if v_origen not in ('ESTATICO', 'CATALOGO') then
    raise exception 'El origen de valores debe ser ESTATICO o CATALOGO';
  end if;

  if v_origen = 'CATALOGO' and (p_tipo <> 'LISTA' or v_nombre not in ('marca', 'modelo', 'anio', 'ubigeo', 'tipo')) then
    raise exception 'Solo marca, modelo, anio, ubigeo y tipo pueden tomar sus opciones del catálogo (tipo LISTA)';
  end if;

  if p_tipo = 'LISTA' and v_origen = 'ESTATICO' and cardinality(v_valores) = 0 then
    raise exception 'Un campo de tipo lista necesita al menos un valor permitido';
  end if;

  if (p_tipo <> 'LISTA' or v_origen = 'CATALOGO') and cardinality(v_valores) > 0 then
    raise exception 'Solo los campos de lista con origen ESTATICO llevan valores permitidos';
  end if;

  if exists (select 1 from unnest(v_valores) x where length(x) > 60) then
    raise exception 'Cada valor permitido puede tener hasta 60 caracteres';
  end if;

  if v_id is null then
    if not exists (select 1 from svas.aseguradora where id = p_aseguradora_id) then
      raise exception 'La aseguradora no existe' using errcode = 'P0002';
    end if;

    insert into svas.campo_requerido (aseguradora_id, nombre, tipo, obligatorio, activo, origen_valores)
    values (p_aseguradora_id, v_nombre, p_tipo, coalesce(p_obligatorio, true), coalesce(p_activo, true), v_origen)
    returning id into v_id;
  else
    perform 1 from svas.campo_requerido where id = v_id for update;
    if not found then
      raise exception 'El campo no existe' using errcode = 'P0002';
    end if;
    v_antes := svas._campo_json(v_id);

    update svas.campo_requerido
       set nombre = v_nombre, tipo = p_tipo, obligatorio = coalesce(p_obligatorio, obligatorio),
           activo = coalesce(p_activo, activo), origen_valores = v_origen
     where id = v_id;

    delete from svas.valor_permitido
     where campo_requerido_id = v_id and valor <> all (v_valores);
  end if;

  insert into svas.valor_permitido (campo_requerido_id, valor)
  select v_id, x from unnest(v_valores) x
  on conflict on constraint uq_valor_por_campo do nothing;

  v_despues := svas._campo_json(v_id);

  if v_antes is null then
    insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(), 'CREAR_CAMPO', 'campo_requerido', v_id,
            jsonb_build_object('despues', v_despues));
  elsif v_antes <> v_despues then
    insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(), 'EDITAR_CAMPO', 'campo_requerido', v_id,
            jsonb_build_object('antes', v_antes, 'despues', v_despues));
  end if;

  return v_despues;
end;
$$;

-- ── Campo requerido: activar / desactivar (DELETE /admin/campos/:id, RN-16) ─
create or replace function svas.admin_cambiar_estado_campo(
  p_campo_id uuid,
  p_activo boolean
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_antes svas.campo_requerido;
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);

  select * into v_antes from svas.campo_requerido where id = p_campo_id for update;
  if not found then
    raise exception 'El campo no existe' using errcode = 'P0002';
  end if;

  if v_antes.activo <> p_activo then
    update svas.campo_requerido set activo = p_activo where id = p_campo_id;

    insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(),
            case when p_activo then 'ACTIVAR_CAMPO' else 'DESACTIVAR_CAMPO' end,
            'campo_requerido', p_campo_id,
            jsonb_build_object('antes', jsonb_build_object('activo', v_antes.activo),
                               'despues', jsonb_build_object('activo', p_activo)));
  end if;

  return svas._campo_json(p_campo_id);
end;
$$;

-- ── Reglas de inspección (carga en bloque, RN-25) ───────────────────────────
-- p_reglas: [{ "aseguradora_id": uuid, "uso": uso_vehiculo, "requiere_inspeccion": bool }]
create or replace function svas.admin_guardar_regla_inspeccion(p_reglas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_antes   jsonb;
  v_despues jsonb;
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);

  if p_reglas is null or jsonb_typeof(p_reglas) <> 'array' or jsonb_array_length(p_reglas) = 0 then
    raise exception 'Indica al menos una regla de inspección';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_reglas) r
     where r->>'aseguradora_id' is null or r->>'uso' is null
        or jsonb_typeof(r->'requiere_inspeccion') is distinct from 'boolean'
  ) then
    raise exception 'Cada regla necesita aseguradora_id, uso y requiere_inspeccion';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_reglas) r
     group by r->>'aseguradora_id', r->>'uso' having count(*) > 1
  ) then
    raise exception 'Hay reglas repetidas para la misma aseguradora y uso';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_reglas) r
     where not exists (select 1 from svas.aseguradora a where a.id = (r->>'aseguradora_id')::uuid)
  ) then
    raise exception 'La aseguradora no existe' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(to_jsonb(ri) order by ri.aseguradora_id, ri.uso), '[]'::jsonb)
    into v_antes
    from svas.regla_inspeccion ri
   where (ri.aseguradora_id, ri.uso) in (
     select (r->>'aseguradora_id')::uuid, (r->>'uso')::svas.uso_vehiculo
       from jsonb_array_elements(p_reglas) r);

  insert into svas.regla_inspeccion (aseguradora_id, uso, requiere_inspeccion)
  select (r->>'aseguradora_id')::uuid, (r->>'uso')::svas.uso_vehiculo, (r->>'requiere_inspeccion')::boolean
    from jsonb_array_elements(p_reglas) r
  on conflict on constraint uq_regla_aseguradora_uso
  do update set requiere_inspeccion = excluded.requiere_inspeccion;

  select coalesce(jsonb_agg(to_jsonb(ri) order by ri.aseguradora_id, ri.uso), '[]'::jsonb)
    into v_despues
    from svas.regla_inspeccion ri
   where (ri.aseguradora_id, ri.uso) in (
     select (r->>'aseguradora_id')::uuid, (r->>'uso')::svas.uso_vehiculo
       from jsonb_array_elements(p_reglas) r);

  if v_antes <> v_despues then
    insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(), 'GUARDAR_REGLAS_INSPECCION', 'regla_inspeccion', null,
            jsonb_build_object('antes', v_antes, 'despues', v_despues));
  end if;

  return v_despues;
end;
$$;

-- ── Permisos: solo usuarios autenticados (el rol lo valida exigir_rol) ──────
revoke execute on function svas.admin_actualizar_parametros(jsonb) from public, anon;
revoke execute on function svas.admin_cambiar_estado_aseguradora(uuid, boolean) from public, anon;
revoke execute on function svas.admin_guardar_plan(uuid, uuid, text, text) from public, anon;
revoke execute on function svas.admin_cambiar_estado_plan(uuid, boolean) from public, anon;
revoke execute on function svas.admin_guardar_campo(uuid, uuid, text, svas.tipo_campo, boolean, text, text[], boolean) from public, anon;
revoke execute on function svas.admin_cambiar_estado_campo(uuid, boolean) from public, anon;
revoke execute on function svas.admin_guardar_regla_inspeccion(jsonb) from public, anon;

grant execute on function svas.admin_actualizar_parametros(jsonb) to authenticated;
grant execute on function svas.admin_cambiar_estado_aseguradora(uuid, boolean) to authenticated;
grant execute on function svas.admin_guardar_plan(uuid, uuid, text, text) to authenticated;
grant execute on function svas.admin_cambiar_estado_plan(uuid, boolean) to authenticated;
grant execute on function svas.admin_guardar_campo(uuid, uuid, text, svas.tipo_campo, boolean, text, text[], boolean) to authenticated;
grant execute on function svas.admin_cambiar_estado_campo(uuid, boolean) to authenticated;
grant execute on function svas.admin_guardar_regla_inspeccion(jsonb) to authenticated;

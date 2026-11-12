-- 0023 · RPCs de administración de tarifas (§6.12): admin_guardar_tarifa_plan,
--        admin_guardar_pesos, admin_guardar_rangos_suma
-- Nota: el doc los ubica en 0015, pero 0015 ya se aplicó sin las tablas de 0006;
-- una migración aplicada no se edita, por eso van aquí.
--
-- El zod de `parametros` (según codigo_estrategia) lo valida el backend antes de
-- llamar; aquí solo se exige que sea un objeto JSON. Las cargas son upsert (no
-- borran filas). Cada guardado deja en registro_actividad las filas que cambiaron.

-- ── Tasa base + parámetros de un plan ───────────────────────────────────────
create or replace function svas.admin_guardar_tarifa_plan(
  p_plan_id uuid,
  p_tasa_base numeric,
  p_parametros jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_antes   svas.tarifa_plan;
  v_despues svas.tarifa_plan;
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);

  if not exists (select 1 from svas.plan where id = p_plan_id) then
    raise exception 'El plan no existe' using errcode = 'P0002';
  end if;

  if p_tasa_base is null or p_tasa_base <= 0 or p_tasa_base >= 1 then
    raise exception 'La tasa base debe estar entre 0 y 1 (p. ej. 0.0420 = 4,2 %%)';
  end if;

  if p_parametros is null or jsonb_typeof(p_parametros) <> 'object' then
    raise exception 'Los parámetros del plan deben ser un objeto JSON';
  end if;

  select * into v_antes from svas.tarifa_plan where plan_id = p_plan_id for update;

  insert into svas.tarifa_plan (plan_id, tasa_base, parametros, actualizado_en)
  values (p_plan_id, round(p_tasa_base, 4), p_parametros, now())
  on conflict (plan_id) do update
    set tasa_base = excluded.tasa_base,
        parametros = excluded.parametros,
        actualizado_en = now()
  returning * into v_despues;

  if v_antes.plan_id is null
     or v_antes.tasa_base <> v_despues.tasa_base
     or v_antes.parametros <> v_despues.parametros then
    insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(), 'GUARDAR_TARIFA_PLAN', 'tarifa_plan', p_plan_id,
            jsonb_build_object(
              'antes', case when v_antes.plan_id is null then null else
                       jsonb_build_object('tasa_base', v_antes.tasa_base, 'parametros', v_antes.parametros) end,
              'despues', jsonb_build_object('tasa_base', v_despues.tasa_base, 'parametros', v_despues.parametros)));
  end if;

  return to_jsonb(v_despues);
end;
$$;

-- ── Carga masiva a una tabla de pesos ───────────────────────────────────────
-- p_tabla ∈ marca | modelo | anio | tipo | ubigeo
-- p_filas: [{ "clave": uuid|año|ubigeo, "peso": 0.5–3 }]
create or replace function svas.admin_guardar_pesos(
  p_tabla text,
  p_aseguradora_id uuid,
  p_filas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_tabla    text;  -- tabla de pesos
  v_col      text;  -- columna clave en la tabla de pesos
  v_tipo     text;  -- tipo SQL de la clave
  v_cat      text;  -- tabla del catálogo donde debe existir la clave
  v_cat_col  text;
  v_mala     text;
  v_cambios  jsonb;
  v_total    int;
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);

  -- Lista blanca: los identificadores dinámicos solo salen de aquí.
  case p_tabla
    when 'marca'  then v_tabla := 'peso_marca';  v_col := 'marca_id';  v_tipo := 'uuid';     v_cat := 'marca';         v_cat_col := 'id';
    when 'modelo' then v_tabla := 'peso_modelo'; v_col := 'modelo_id'; v_tipo := 'uuid';     v_cat := 'modelo';        v_cat_col := 'id';
    when 'tipo'   then v_tabla := 'peso_tipo';   v_col := 'tipo_id';   v_tipo := 'uuid';     v_cat := 'tipo_vehiculo'; v_cat_col := 'id';
    when 'ubigeo' then v_tabla := 'peso_ubigeo'; v_col := 'ubigeo';    v_tipo := 'char(6)';  v_cat := 'ubigeo';        v_cat_col := 'codigo';
    when 'anio'   then v_tabla := 'peso_anio';   v_col := 'anio';      v_tipo := 'smallint'; v_cat := null;            v_cat_col := null;
    else raise exception 'La tabla de pesos debe ser marca, modelo, anio, tipo o ubigeo';
  end case;

  if not exists (select 1 from svas.aseguradora where id = p_aseguradora_id) then
    raise exception 'La aseguradora no existe' using errcode = 'P0002';
  end if;

  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'Indica al menos un peso';
  end if;
  if jsonb_array_length(p_filas) > 2000 then
    raise exception 'Máximo 2000 pesos por envío';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_filas) f
     where coalesce(f->>'clave', '') = ''
        or jsonb_typeof(f->'peso') is distinct from 'number'
        or (f->>'peso')::numeric < 0.5 or (f->>'peso')::numeric > 3
  ) then
    raise exception 'Cada peso necesita una clave y un valor entre 0,500 y 3,000';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_filas) f group by f->>'clave' having count(*) > 1
  ) then
    raise exception 'Hay claves repetidas en la carga';
  end if;

  if v_cat is null then
    if exists (
      select 1 from jsonb_array_elements(p_filas) f
       where (f->>'clave') !~ '^[0-9]{4}$' or (f->>'clave')::int not between 1950 and 2100
    ) then
      raise exception 'Cada año debe estar entre 1950 y 2100';
    end if;
  else
    execute format(
      'select f->>''clave'' from jsonb_array_elements($1) f
        where not exists (select 1 from svas.%I c where c.%I::text = f->>''clave'') limit 1',
      v_cat, v_cat_col)
    into v_mala using p_filas;
    if v_mala is not null then
      raise exception 'La clave % no existe en el catálogo de %', v_mala, p_tabla;
    end if;
  end if;

  -- Filas que realmente cambian (nuevas o con otro peso), para la bitácora.
  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object(''clave'', f->>''clave'',
              ''antes'', t.peso, ''despues'', round((f->>''peso'')::numeric, 3))), ''[]''::jsonb)
       from jsonb_array_elements($2) f
       left join svas.%I t on t.aseguradora_id = $1 and t.%I::text = f->>''clave''
      where t.peso is distinct from round((f->>''peso'')::numeric, 3)',
    v_tabla, v_col)
  into v_cambios using p_aseguradora_id, p_filas;

  execute format(
    'insert into svas.%I (aseguradora_id, %I, peso)
     select $1, (f->>''clave'')::%s, round((f->>''peso'')::numeric, 3)
       from jsonb_array_elements($2) f
     on conflict (aseguradora_id, %I) do update set peso = excluded.peso',
    v_tabla, v_col, v_tipo, v_col)
  using p_aseguradora_id, p_filas;

  if jsonb_array_length(v_cambios) > 0 then
    insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(), 'GUARDAR_PESOS', v_tabla, p_aseguradora_id,
            jsonb_build_object('tabla', p_tabla, 'cambios', v_cambios));
  end if;

  execute format('select count(*) from svas.%I where aseguradora_id = $1', v_tabla)
    into v_total using p_aseguradora_id;

  return jsonb_build_object('tabla', p_tabla, 'recibidas', jsonb_array_length(p_filas),
                            'cambiadas', jsonb_array_length(v_cambios), 'total', v_total);
end;
$$;

-- ── Carga masiva de rangos de suma asegurada ────────────────────────────────
-- p_filas: [{ "modelo_id": uuid, "anio": int, "suma_minima": num, "suma_maxima": num }]
create or replace function svas.admin_guardar_rangos_suma(
  p_aseguradora_id uuid,
  p_filas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_cambios jsonb;
  v_total   int;
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);

  if not exists (select 1 from svas.aseguradora where id = p_aseguradora_id) then
    raise exception 'La aseguradora no existe' using errcode = 'P0002';
  end if;

  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'Indica al menos un rango';
  end if;
  if jsonb_array_length(p_filas) > 5000 then
    raise exception 'Máximo 5000 rangos por envío';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_filas) f
     where f->>'modelo_id' is null
        or jsonb_typeof(f->'anio') is distinct from 'number'
        or jsonb_typeof(f->'suma_minima') is distinct from 'number'
        or jsonb_typeof(f->'suma_maxima') is distinct from 'number'
  ) then
    raise exception 'Cada rango necesita modelo_id, anio, suma_minima y suma_maxima';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_filas) f
     where (f->>'anio')::numeric not between 1950 and 2100
        or (f->>'suma_minima')::numeric <= 0
        or (f->>'suma_minima')::numeric > (f->>'suma_maxima')::numeric
  ) then
    raise exception 'Cada rango necesita un año entre 1950 y 2100 y 0 < suma mínima ≤ suma máxima';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_filas) f
     group by f->>'modelo_id', f->>'anio' having count(*) > 1
  ) then
    raise exception 'Hay rangos repetidos para el mismo modelo y año';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_filas) f
     where not exists (select 1 from svas.modelo m where m.id = (f->>'modelo_id')::uuid)
  ) then
    raise exception 'Algún modelo no existe en el catálogo' using errcode = 'P0002';
  end if;

  with entrada as (
    select (f->>'modelo_id')::uuid as modelo_id,
           (f->>'anio')::smallint  as anio,
           round((f->>'suma_minima')::numeric, 2) as minima,
           round((f->>'suma_maxima')::numeric, 2) as maxima
      from jsonb_array_elements(p_filas) f
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'modelo_id', e.modelo_id, 'anio', e.anio,
           'antes', case when r.modelo_id is null then null
                         else jsonb_build_object('suma_minima', r.suma_minima, 'suma_maxima', r.suma_maxima) end,
           'despues', jsonb_build_object('suma_minima', e.minima, 'suma_maxima', e.maxima))), '[]'::jsonb)
    into v_cambios
    from entrada e
    left join svas.rango_suma_asegurada r
           on r.aseguradora_id = p_aseguradora_id and r.modelo_id = e.modelo_id and r.anio = e.anio
   where r.modelo_id is null or r.suma_minima <> e.minima or r.suma_maxima <> e.maxima;

  insert into svas.rango_suma_asegurada (aseguradora_id, modelo_id, anio, suma_minima, suma_maxima)
  select p_aseguradora_id, (f->>'modelo_id')::uuid, (f->>'anio')::smallint,
         round((f->>'suma_minima')::numeric, 2), round((f->>'suma_maxima')::numeric, 2)
    from jsonb_array_elements(p_filas) f
  on conflict (aseguradora_id, modelo_id, anio) do update
    set suma_minima = excluded.suma_minima, suma_maxima = excluded.suma_maxima;

  if jsonb_array_length(v_cambios) > 0 then
    insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(), 'GUARDAR_RANGOS_SUMA', 'rango_suma_asegurada', p_aseguradora_id,
            jsonb_build_object('cambios', v_cambios));
  end if;

  select count(*) into v_total from svas.rango_suma_asegurada where aseguradora_id = p_aseguradora_id;

  return jsonb_build_object('recibidas', jsonb_array_length(p_filas),
                            'cambiadas', jsonb_array_length(v_cambios), 'total', v_total);
end;
$$;

-- ── Permisos ────────────────────────────────────────────────────────────────
revoke execute on function svas.admin_guardar_tarifa_plan(uuid, numeric, jsonb) from public, anon;
revoke execute on function svas.admin_guardar_pesos(text, uuid, jsonb) from public, anon;
revoke execute on function svas.admin_guardar_rangos_suma(uuid, jsonb) from public, anon;

grant execute on function svas.admin_guardar_tarifa_plan(uuid, numeric, jsonb) to authenticated;
grant execute on function svas.admin_guardar_pesos(text, uuid, jsonb) to authenticated;
grant execute on function svas.admin_guardar_rangos_suma(uuid, jsonb) to authenticated;

-- 0029 · RPCs de administración de la Prueba de Choque (§6.12 ★, RN-31)
--        admin_guardar_escenario, admin_guardar_coberturas, admin_guardar_frecuencias,
--        admin_guardar_zonas, admin_guardar_factores
-- Fuente: contexto §4.1, §6.12, §16; arquitectura §2 (tabla de módulos, fila
-- administracion ★). El doc nombra admin_guardar_cobertura / _frecuencia en
-- singular; aquí las de catálogo son cargas por lote (como admin_guardar_pesos).
--
-- Todas: solo ADMINISTRADOR, upsert (no borran filas) y una fila en
-- registro_actividad con el antes/después de lo que realmente cambió (RN-31).
-- Las simulaciones ya guardadas no se tocan: son instantáneas (RN-32).
-- En las filas, el escenario va por su código (CHOQUE_LEVE…), no por id.

-- ── Escenario (crear o editar uno, por código) ──────────────────────────────
-- p_payload: { nombre, descripcion, monto_dano_referencial (número o null =
-- suma asegurada del plan), dias_taller_estimados, orden, activo }
create or replace function svas.admin_guardar_escenario(
  p_codigo text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_antes   svas.escenario_siniestro;
  v_despues svas.escenario_siniestro;
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);

  if p_codigo is null or p_codigo !~ '^[A-Z][A-Z_]{1,29}$' then
    raise exception 'El código del escenario va en mayúsculas y guiones bajos (p. ej. CHOQUE_LEVE)';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Los datos del escenario deben ser un objeto JSON';
  end if;

  if jsonb_typeof(p_payload->'nombre') is distinct from 'string'
     or btrim(p_payload->>'nombre') = '' or length(btrim(p_payload->>'nombre')) > 80 then
    raise exception 'El nombre del escenario es obligatorio (máximo 80 caracteres)';
  end if;

  if jsonb_typeof(p_payload->'descripcion') is distinct from 'string'
     or btrim(p_payload->>'descripcion') = '' or length(btrim(p_payload->>'descripcion')) > 500 then
    raise exception 'La descripción del escenario es obligatoria (máximo 500 caracteres)';
  end if;

  if coalesce(jsonb_typeof(p_payload->'monto_dano_referencial'), 'falta') not in ('null', 'number')
     or (jsonb_typeof(p_payload->'monto_dano_referencial') = 'number'
         and ((p_payload->>'monto_dano_referencial')::numeric < 0.01
              or (p_payload->>'monto_dano_referencial')::numeric > 9999999999.99)) then
    raise exception 'El monto de daño debe ser mayor que 0, o null para usar la suma asegurada del plan';
  end if;

  if jsonb_typeof(p_payload->'dias_taller_estimados') is distinct from 'number'
     or (p_payload->>'dias_taller_estimados')::numeric % 1 <> 0
     or (p_payload->>'dias_taller_estimados')::numeric not between 0 and 365 then
    raise exception 'Los días de taller deben ser un entero entre 0 y 365';
  end if;

  if jsonb_typeof(p_payload->'orden') is distinct from 'number'
     or (p_payload->>'orden')::numeric % 1 <> 0
     or (p_payload->>'orden')::numeric not between 0 and 1000 then
    raise exception 'El orden debe ser un entero entre 0 y 1000';
  end if;

  if jsonb_typeof(p_payload->'activo') is distinct from 'boolean' then
    raise exception 'Indica si el escenario está activo (true o false)';
  end if;

  select * into v_antes from svas.escenario_siniestro where codigo = p_codigo for update;

  insert into svas.escenario_siniestro
    (codigo, nombre, descripcion, monto_dano_referencial, dias_taller_estimados, orden, activo)
  values (p_codigo,
          btrim(p_payload->>'nombre'),
          btrim(p_payload->>'descripcion'),
          round((p_payload->>'monto_dano_referencial')::numeric, 2),
          (p_payload->>'dias_taller_estimados')::smallint,
          (p_payload->>'orden')::smallint,
          (p_payload->>'activo')::boolean)
  on conflict (codigo) do update
    set nombre                 = excluded.nombre,
        descripcion            = excluded.descripcion,
        monto_dano_referencial = excluded.monto_dano_referencial,
        dias_taller_estimados  = excluded.dias_taller_estimados,
        orden                  = excluded.orden,
        activo                 = excluded.activo
  returning * into v_despues;

  -- Sin escenarios activos la Prueba de Choque no mostraría nada.
  if not exists (select 1 from svas.escenario_siniestro where activo) then
    raise exception 'Debe quedar al menos un escenario activo';
  end if;

  if v_antes.id is null or v_antes is distinct from v_despues then
    insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(),
            case when v_antes.id is null then 'CREAR_ESCENARIO' else 'GUARDAR_ESCENARIO' end,
            'escenario_siniestro', v_despues.id,
            jsonb_build_object(
              'antes', case when v_antes.id is null then null else to_jsonb(v_antes) end,
              'despues', to_jsonb(v_despues)));
  end if;

  return to_jsonb(v_despues);
end;
$$;

-- ── Coberturas plan × escenario (lote) ──────────────────────────────────────
-- p_filas: [{ plan_id, escenario, cubre, deducible_pct, deducible_minimo,
--             tope_cobertura, condicion_taller, dias_auto_reemplazo, fuente }]
-- deducible_pct, deducible_minimo y tope_cobertura: número o null (tope null =
-- hasta la suma asegurada). Si cubre = false, no llevan deducible, tope ni reemplazo.
create or replace function svas.admin_guardar_coberturas(p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_mala    text;
  v_cambios jsonb;
  v_total   int;
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);

  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'Indica al menos una cobertura';
  end if;
  if jsonb_array_length(p_filas) > 500 then
    raise exception 'Máximo 500 coberturas por envío';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_filas) f
     where jsonb_typeof(f) <> 'object'
        or jsonb_typeof(f->'plan_id') is distinct from 'string'
        or (f->>'plan_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or jsonb_typeof(f->'escenario') is distinct from 'string'
        or jsonb_typeof(f->'cubre') is distinct from 'boolean'
        or coalesce(jsonb_typeof(f->'deducible_pct'), 'null') not in ('null', 'number')
        or coalesce(jsonb_typeof(f->'deducible_minimo'), 'null') not in ('null', 'number')
        or coalesce(jsonb_typeof(f->'tope_cobertura'), 'null') not in ('null', 'number')
        or coalesce(jsonb_typeof(f->'dias_auto_reemplazo'), 'number') <> 'number'
        or coalesce(f->>'condicion_taller', 'CUALQUIERA')
             not in (select unnest(enum_range(null::svas.condicion_taller))::text)
        or jsonb_typeof(f->'fuente') is distinct from 'string'
        or btrim(f->>'fuente') = '' or length(btrim(f->>'fuente')) > 200
  ) then
    raise exception 'Cada cobertura necesita plan_id, escenario, cubre y fuente (máximo 200 caracteres); deducibles y tope son números o null; condicion_taller es AFILIADO o CUALQUIERA';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_filas) f
     where (f->>'deducible_pct')::numeric not between 0 and 100
        or (f->>'deducible_minimo')::numeric not between 0 and 9999999999.99
        or (f->>'tope_cobertura')::numeric not between 0.01 and 9999999999.99
        or (f->>'dias_auto_reemplazo')::numeric % 1 <> 0
        or (f->>'dias_auto_reemplazo')::numeric not between 0 and 365
  ) then
    raise exception 'El deducible va de 0 a 100 %%, el deducible mínimo no puede ser negativo, el tope debe ser mayor que 0 y los días de reemplazo un entero entre 0 y 365';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_filas) f
     where not (f->>'cubre')::boolean
       and (f->>'deducible_pct' is not null or f->>'deducible_minimo' is not null
            or f->>'tope_cobertura' is not null
            or coalesce((f->>'dias_auto_reemplazo')::numeric, 0) <> 0)
  ) then
    raise exception 'Si el plan no cubre el escenario, no lleva deducible, tope ni días de reemplazo';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_filas) f
     group by lower(f->>'plan_id'), f->>'escenario' having count(*) > 1
  ) then
    raise exception 'Hay coberturas repetidas para el mismo plan y escenario';
  end if;

  select f->>'plan_id' into v_mala
    from jsonb_array_elements(p_filas) f
   where not exists (select 1 from svas.plan p where p.id = (f->>'plan_id')::uuid)
   limit 1;
  if v_mala is not null then
    raise exception 'El plan % no existe', v_mala using errcode = 'P0002';
  end if;

  select f->>'escenario' into v_mala
    from jsonb_array_elements(p_filas) f
   where not exists (select 1 from svas.escenario_siniestro e where e.codigo = f->>'escenario')
   limit 1;
  if v_mala is not null then
    raise exception 'El escenario % no existe', v_mala using errcode = 'P0002';
  end if;

  -- Un solo comando: `antes` ve la foto previa al upsert y `guardadas` solo
  -- devuelve las filas nuevas o que cambiaron (el WHERE del DO UPDATE).
  with entrada as (
    select (f->>'plan_id')::uuid                                           as plan_id,
           e.id                                                            as escenario_id,
           e.codigo                                                        as escenario,
           (f->>'cubre')::boolean                                          as cubre,
           round((f->>'deducible_pct')::numeric, 2)                        as deducible_pct,
           round((f->>'deducible_minimo')::numeric, 2)                     as deducible_minimo,
           round((f->>'tope_cobertura')::numeric, 2)                       as tope_cobertura,
           coalesce(f->>'condicion_taller', 'CUALQUIERA')::svas.condicion_taller as condicion_taller,
           coalesce((f->>'dias_auto_reemplazo')::smallint, 0)              as dias_auto_reemplazo,
           btrim(f->>'fuente')                                             as fuente
      from jsonb_array_elements(p_filas) f
      join svas.escenario_siniestro e on e.codigo = f->>'escenario'
  ),
  antes as (
    select c.* from svas.cobertura_plan_escenario c
      join entrada x on x.plan_id = c.plan_id and x.escenario_id = c.escenario_id
  ),
  guardadas as (
    insert into svas.cobertura_plan_escenario as c
      (plan_id, escenario_id, cubre, deducible_pct, deducible_minimo, tope_cobertura,
       condicion_taller, dias_auto_reemplazo, fuente, actualizado_en)
    select plan_id, escenario_id, cubre, deducible_pct, deducible_minimo, tope_cobertura,
           condicion_taller, dias_auto_reemplazo, fuente, now()
      from entrada
    on conflict (plan_id, escenario_id) do update
      set cubre               = excluded.cubre,
          deducible_pct       = excluded.deducible_pct,
          deducible_minimo    = excluded.deducible_minimo,
          tope_cobertura      = excluded.tope_cobertura,
          condicion_taller    = excluded.condicion_taller,
          dias_auto_reemplazo = excluded.dias_auto_reemplazo,
          fuente              = excluded.fuente,
          actualizado_en      = now()
      where (c.cubre, c.deducible_pct, c.deducible_minimo, c.tope_cobertura,
             c.condicion_taller, c.dias_auto_reemplazo, c.fuente)
            is distinct from
            (excluded.cubre, excluded.deducible_pct, excluded.deducible_minimo, excluded.tope_cobertura,
             excluded.condicion_taller, excluded.dias_auto_reemplazo, excluded.fuente)
    returning c.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'plan_id', g.plan_id,
           'escenario', x.escenario,
           'antes', case when a.id is null then null else
                    to_jsonb(a) - 'id' - 'plan_id' - 'escenario_id' - 'actualizado_en' end,
           'despues', to_jsonb(g) - 'id' - 'plan_id' - 'escenario_id' - 'actualizado_en')
           order by g.plan_id, x.escenario), '[]'::jsonb)
    into v_cambios
    from guardadas g
    join entrada x on x.plan_id = g.plan_id and x.escenario_id = g.escenario_id
    left join antes a on a.plan_id = g.plan_id and a.escenario_id = g.escenario_id;

  if jsonb_array_length(v_cambios) > 0 then
    insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(), 'GUARDAR_COBERTURAS_CHOQUE', 'cobertura_plan_escenario', null,
            jsonb_build_object('cambios', v_cambios));
  end if;

  select count(*) into v_total from svas.cobertura_plan_escenario;

  return jsonb_build_object('recibidas', jsonb_array_length(p_filas),
                            'cambiadas', jsonb_array_length(v_cambios), 'total', v_total);
end;
$$;

-- ── Frecuencias escenario × uso × zona (lote) ───────────────────────────────
-- p_filas: [{ escenario, uso, zona, probabilidad_anual }]
-- Tope 0,95: es el mismo techo que el motor aplica después de los factores (§16.3).
create or replace function svas.admin_guardar_frecuencias(p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_mala    text;
  v_cambios jsonb;
  v_total   int;
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);

  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'Indica al menos una frecuencia';
  end if;
  if jsonb_array_length(p_filas) > 500 then
    raise exception 'Máximo 500 frecuencias por envío';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_filas) f
     where jsonb_typeof(f) <> 'object'
        or jsonb_typeof(f->'escenario') is distinct from 'string'
        or coalesce(f->>'uso', '') not in (select unnest(enum_range(null::svas.uso_vehiculo))::text)
        or coalesce(f->>'zona', '') not in (select unnest(enum_range(null::svas.zona_riesgo))::text)
        or jsonb_typeof(f->'probabilidad_anual') is distinct from 'number'
  ) then
    raise exception 'Cada frecuencia necesita escenario, uso (PARTICULAR, COMERCIAL_LIGERO o TRANSPORTE_PASAJEROS), zona (ALTA, MEDIA o BAJA) y probabilidad_anual';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_filas) f
     where round((f->>'probabilidad_anual')::numeric, 4) not between 0.0001 and 0.95
  ) then
    raise exception 'La probabilidad anual debe estar entre 0,0001 y 0,95 (0,12 = 12 %% al año)';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_filas) f
     group by f->>'escenario', f->>'uso', f->>'zona' having count(*) > 1
  ) then
    raise exception 'Hay frecuencias repetidas para el mismo escenario, uso y zona';
  end if;

  select f->>'escenario' into v_mala
    from jsonb_array_elements(p_filas) f
   where not exists (select 1 from svas.escenario_siniestro e where e.codigo = f->>'escenario')
   limit 1;
  if v_mala is not null then
    raise exception 'El escenario % no existe', v_mala using errcode = 'P0002';
  end if;

  with entrada as (
    select e.id as escenario_id, e.codigo as escenario,
           (f->>'uso')::svas.uso_vehiculo as uso,
           (f->>'zona')::svas.zona_riesgo as zona,
           round((f->>'probabilidad_anual')::numeric, 4) as probabilidad_anual
      from jsonb_array_elements(p_filas) f
      join svas.escenario_siniestro e on e.codigo = f->>'escenario'
  ),
  antes as (
    select t.* from svas.frecuencia_escenario t
      join entrada x on x.escenario_id = t.escenario_id and x.uso = t.uso and x.zona = t.zona
  ),
  guardadas as (
    insert into svas.frecuencia_escenario as t (escenario_id, uso, zona, probabilidad_anual)
    select escenario_id, uso, zona, probabilidad_anual from entrada
    on conflict (escenario_id, uso, zona) do update
      set probabilidad_anual = excluded.probabilidad_anual
      where t.probabilidad_anual <> excluded.probabilidad_anual
    returning t.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'escenario', x.escenario, 'uso', g.uso, 'zona', g.zona,
           'antes', a.probabilidad_anual, 'despues', g.probabilidad_anual)
           order by x.escenario, g.uso, g.zona), '[]'::jsonb)
    into v_cambios
    from guardadas g
    join entrada x on x.escenario_id = g.escenario_id and x.uso = g.uso and x.zona = g.zona
    left join antes a on a.escenario_id = g.escenario_id and a.uso = g.uso and a.zona = g.zona;

  if jsonb_array_length(v_cambios) > 0 then
    insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(), 'GUARDAR_FRECUENCIAS_CHOQUE', 'frecuencia_escenario', null,
            jsonb_build_object('cambios', v_cambios));
  end if;

  select count(*) into v_total from svas.frecuencia_escenario;

  return jsonb_build_object('recibidas', jsonb_array_length(p_filas),
                            'cambiadas', jsonb_array_length(v_cambios), 'total', v_total);
end;
$$;

-- ── Zona de riesgo por distrito (lote) ──────────────────────────────────────
-- p_filas: [{ ubigeo, zona }]. Un distrito sin fila cuenta como MEDIA (§4.1).
create or replace function svas.admin_guardar_zonas(p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_mala    text;
  v_cambios jsonb;
  v_total   int;
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);

  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'Indica al menos un distrito';
  end if;
  if jsonb_array_length(p_filas) > 2000 then
    raise exception 'Máximo 2000 distritos por envío';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_filas) f
     where jsonb_typeof(f) <> 'object'
        or jsonb_typeof(f->'ubigeo') is distinct from 'string'
        or (f->>'ubigeo') !~ '^[0-9]{6}$'
        or coalesce(f->>'zona', '') not in (select unnest(enum_range(null::svas.zona_riesgo))::text)
  ) then
    raise exception 'Cada distrito necesita un ubigeo de 6 dígitos y una zona (ALTA, MEDIA o BAJA)';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_filas) f group by f->>'ubigeo' having count(*) > 1
  ) then
    raise exception 'Hay distritos repetidos en la carga';
  end if;

  select f->>'ubigeo' into v_mala
    from jsonb_array_elements(p_filas) f
   where not exists (select 1 from svas.ubigeo u where u.codigo = f->>'ubigeo')
   limit 1;
  if v_mala is not null then
    raise exception 'El ubigeo % no existe en el catálogo', v_mala using errcode = 'P0002';
  end if;

  with entrada as (
    select (f->>'ubigeo')::char(6) as ubigeo, (f->>'zona')::svas.zona_riesgo as zona
      from jsonb_array_elements(p_filas) f
  ),
  antes as (
    select t.* from svas.zona_riesgo_distrito t join entrada x on x.ubigeo = t.ubigeo
  ),
  guardadas as (
    insert into svas.zona_riesgo_distrito as t (ubigeo, zona)
    select ubigeo, zona from entrada
    on conflict (ubigeo) do update
      set zona = excluded.zona
      where t.zona <> excluded.zona
    returning t.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'ubigeo', g.ubigeo, 'antes', a.zona, 'despues', g.zona) order by g.ubigeo), '[]'::jsonb)
    into v_cambios
    from guardadas g
    left join antes a on a.ubigeo = g.ubigeo;

  if jsonb_array_length(v_cambios) > 0 then
    insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(), 'GUARDAR_ZONAS_RIESGO', 'zona_riesgo_distrito', null,
            jsonb_build_object('cambios', v_cambios));
  end if;

  select count(*) into v_total from svas.zona_riesgo_distrito;

  return jsonb_build_object('recibidas', jsonb_array_length(p_filas),
                            'cambiadas', jsonb_array_length(v_cambios), 'total', v_total);
end;
$$;

-- ── Factores de perfil (lote) ───────────────────────────────────────────────
-- p_filas: [{ escenario, variable, multiplicador }]. 1,00 = no cambia la probabilidad.
create or replace function svas.admin_guardar_factores(p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_mala    text;
  v_cambios jsonb;
  v_total   int;
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);

  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'Indica al menos un factor';
  end if;
  if jsonb_array_length(p_filas) > 500 then
    raise exception 'Máximo 500 factores por envío';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_filas) f
     where jsonb_typeof(f) <> 'object'
        or jsonb_typeof(f->'escenario') is distinct from 'string'
        or coalesce(f->>'variable', '') not in (select unnest(enum_range(null::svas.variable_perfil))::text)
        or jsonb_typeof(f->'multiplicador') is distinct from 'number'
  ) then
    raise exception 'Cada factor necesita escenario, variable (ESTACIONA_COCHERA, KM_MES_ALTO o USO_NOCTURNO) y multiplicador';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_filas) f
     where round((f->>'multiplicador')::numeric, 2) not between 0.10 and 3.00
  ) then
    raise exception 'El multiplicador debe estar entre 0,10 y 3,00 (1,00 = sin efecto)';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_filas) f
     group by f->>'escenario', f->>'variable' having count(*) > 1
  ) then
    raise exception 'Hay factores repetidos para el mismo escenario y variable';
  end if;

  select f->>'escenario' into v_mala
    from jsonb_array_elements(p_filas) f
   where not exists (select 1 from svas.escenario_siniestro e where e.codigo = f->>'escenario')
   limit 1;
  if v_mala is not null then
    raise exception 'El escenario % no existe', v_mala using errcode = 'P0002';
  end if;

  with entrada as (
    select e.id as escenario_id, e.codigo as escenario,
           (f->>'variable')::svas.variable_perfil as variable,
           round((f->>'multiplicador')::numeric, 2) as multiplicador
      from jsonb_array_elements(p_filas) f
      join svas.escenario_siniestro e on e.codigo = f->>'escenario'
  ),
  antes as (
    select t.* from svas.factor_perfil t
      join entrada x on x.escenario_id = t.escenario_id and x.variable = t.variable
  ),
  guardadas as (
    insert into svas.factor_perfil as t (escenario_id, variable, multiplicador)
    select escenario_id, variable, multiplicador from entrada
    on conflict (escenario_id, variable) do update
      set multiplicador = excluded.multiplicador
      where t.multiplicador <> excluded.multiplicador
    returning t.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'escenario', x.escenario, 'variable', g.variable,
           'antes', a.multiplicador, 'despues', g.multiplicador)
           order by x.escenario, g.variable), '[]'::jsonb)
    into v_cambios
    from guardadas g
    join entrada x on x.escenario_id = g.escenario_id and x.variable = g.variable
    left join antes a on a.escenario_id = g.escenario_id and a.variable = g.variable;

  if jsonb_array_length(v_cambios) > 0 then
    insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(), 'GUARDAR_FACTORES_PERFIL', 'factor_perfil', null,
            jsonb_build_object('cambios', v_cambios));
  end if;

  select count(*) into v_total from svas.factor_perfil;

  return jsonb_build_object('recibidas', jsonb_array_length(p_filas),
                            'cambiadas', jsonb_array_length(v_cambios), 'total', v_total);
end;
$$;

-- ── Permisos ────────────────────────────────────────────────────────────────
revoke execute on function svas.admin_guardar_escenario(text, jsonb) from public, anon;
revoke execute on function svas.admin_guardar_coberturas(jsonb) from public, anon;
revoke execute on function svas.admin_guardar_frecuencias(jsonb) from public, anon;
revoke execute on function svas.admin_guardar_zonas(jsonb) from public, anon;
revoke execute on function svas.admin_guardar_factores(jsonb) from public, anon;

grant execute on function svas.admin_guardar_escenario(text, jsonb) to authenticated;
grant execute on function svas.admin_guardar_coberturas(jsonb) to authenticated;
grant execute on function svas.admin_guardar_frecuencias(jsonb) to authenticated;
grant execute on function svas.admin_guardar_zonas(jsonb) to authenticated;
grant execute on function svas.admin_guardar_factores(jsonb) to authenticated;

-- 0030 · Contenido comercial de los planes (D8 ★): qué cubre, qué no cubre,
--        exclusiones y requisitos (contexto §4.1, §6.12, §18, RN-42..RN-46)
-- El doc la llama 0020; se numera después de las ya aplicadas (0029).
--
--   · plan: resumen, ideal_para, orden, contenido_actualizado_en
--   · cobertura (catálogo común), cobertura_escenario (puente con la Prueba de
--     Choque), plan_cobertura, plan_exclusion, plan_requisito
--   · fn_incoherencias_plan (RN-43, una sola definición) y la vista
--     v_plan_contenido_completitud (RN-42, solo ADMINISTRADOR)
--   · RPCs admin_guardar_plan_contenido, admin_guardar_cobertura_catalogo,
--     admin_incoherencias_plan y admin_cambiar_estado_plan v2 (no activa
--     planes incompletos)
-- Lectura pública (RN-46): el visitante sin sesión la recibe del backend con
-- service_role; con JWT, por RLS (filas activas de planes activos).

-- ── Columnas nuevas de plan ─────────────────────────────────────────────────
alter table svas.plan
  add column resumen                  varchar(160) null,
  add column ideal_para               varchar(200) null,
  add column orden                    smallint     not null default 0,
  add column contenido_actualizado_en timestamptz  null;

-- ── Catálogo de coberturas (común a todas las aseguradoras) ─────────────────
create table svas.cobertura (
  id          uuid primary key default gen_random_uuid(),
  codigo      varchar(30)  not null,
  nombre      varchar(80)  not null,
  categoria   varchar(20)  not null,
  descripcion varchar(300) not null,
  orden       smallint     not null default 0,
  activa      boolean      not null default true,
  constraint uq_cobertura_codigo unique (codigo),
  constraint ck_cobertura_codigo check (codigo ~ '^[A-Z][A-Z_]{1,29}$'),
  constraint ck_cobertura_categoria check (
    categoria in ('DANOS_PROPIOS', 'ROBO', 'RESPONSABILIDAD', 'ASISTENCIA', 'ADICIONAL')),
  constraint ck_cobertura_textos check (btrim(nombre) <> '' and btrim(descripcion) <> '')
);

-- Cobertura comercial ↔ escenarios de la Prueba de Choque (RN-43).
create table svas.cobertura_escenario (
  cobertura_id uuid not null references svas.cobertura (id) on delete restrict,
  escenario_id uuid not null references svas.escenario_siniestro (id) on delete restrict,
  primary key (cobertura_id, escenario_id)
);

create index ix_cobertura_escenario_escenario on svas.cobertura_escenario (escenario_id);

-- ── Contenido por plan ──────────────────────────────────────────────────────
-- Una fila por cobertura activa; "no cubre" = incluida false, nunca ausencia (RN-42).
create table svas.plan_cobertura (
  plan_id      uuid          not null references svas.plan (id) on delete cascade,
  cobertura_id uuid          not null references svas.cobertura (id) on delete restrict,
  incluida     boolean       not null,
  detalle      varchar(200)  null,     -- lo que ve el cliente: "Hasta USD 100,000"
  limite_monto numeric(12,2) null,     -- el monto del detalle, para ordenar y comparar
  primary key (plan_id, cobertura_id),
  constraint ck_plan_cobertura_coherente check (incluida or limite_monto is null),
  constraint ck_plan_cobertura_valores check (
    (limite_monto is null or limite_monto > 0)
    and (detalle is null or btrim(detalle) <> ''))
);

create index ix_plan_cobertura_cobertura on svas.plan_cobertura (cobertura_id);

create table svas.plan_exclusion (
  id      uuid primary key default gen_random_uuid(),
  plan_id uuid         not null references svas.plan (id) on delete cascade,
  texto   varchar(240) not null,
  orden   smallint     not null default 0,
  activa  boolean      not null default true,
  constraint uq_plan_exclusion_texto unique (plan_id, texto),
  constraint ck_plan_exclusion_texto check (btrim(texto) <> '')
);

-- Informativos: no bloquean cotizar ni comprar (RN-44).
create table svas.plan_requisito (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid         not null references svas.plan (id) on delete cascade,
  tipo        varchar(15)  not null,
  texto       varchar(240) not null,
  obligatorio boolean      not null default true,
  orden       smallint     not null default 0,
  activo      boolean      not null default true,
  constraint ck_requisito_tipo check (tipo in ('VEHICULO', 'CONDUCTOR', 'DOCUMENTO', 'INSPECCION')),
  constraint ck_plan_requisito_texto check (btrim(texto) <> '')
);

create index ix_plan_requisito_plan on svas.plan_requisito (plan_id);
create index ix_plan_exclusion_plan on svas.plan_exclusion (plan_id);

-- ── RN-43: incoherencias con la Prueba de Choque (una sola definición) ──────
-- Por cada cobertura activa del plan ligada a escenarios activos:
--   incluida = true  → al menos un escenario con cubre = true
--   incluida = false → ningún escenario con cubre = true
-- Un escenario sin fila en cobertura_plan_escenario no cuenta como "cubre".
create or replace function svas.fn_incoherencias_plan(p_plan_id uuid)
returns table (codigo varchar, nombre varchar, incluida boolean, escenarios_que_cubren text[])
language sql
stable
security definer
set search_path = svas, public
as $$
  select c.codigo, c.nombre, pc.incluida,
         coalesce(array_agg(e.codigo order by e.orden) filter (where cpe.cubre), '{}')
    from svas.plan_cobertura pc
    join svas.cobertura c            on c.id = pc.cobertura_id and c.activa
    join svas.cobertura_escenario ce on ce.cobertura_id = c.id
    join svas.escenario_siniestro e  on e.id = ce.escenario_id and e.activo
    left join svas.cobertura_plan_escenario cpe
           on cpe.plan_id = pc.plan_id and cpe.escenario_id = e.id
   where pc.plan_id = p_plan_id
   group by c.codigo, c.nombre, c.orden, pc.incluida
  having pc.incluida <> coalesce(bool_or(cpe.cubre), false)
   order by c.orden;
$$;

-- ── Vista de completitud (RN-42, §18.10) ────────────────────────────────────
-- Una fila por plan (también inactivos, para que admin_cambiar_estado_plan
-- pueda revisar antes de activar). Corre con los permisos del dueño y se
-- filtra por rol: solo el ADMINISTRADOR ve filas.
create view svas.v_plan_contenido_completitud as
select v.*,
       (v.coberturas_faltantes = 0 and v.tiene_resumen and v.tiene_descripcion
        and v.tiene_ideal_para and v.n_requisitos > 0 and v.n_exclusiones > 0
        and v.incoherencias_prueba_choque = 0) as completo
  from (
    select p.id                                                     as plan_id,
           p.aseguradora_id,
           a.nombre                                                 as aseguradora,
           p.nombre                                                 as plan,
           p.activo,
           (select count(*) from svas.cobertura c
             where c.activa
               and not exists (select 1 from svas.plan_cobertura pc
                                where pc.plan_id = p.id and pc.cobertura_id = c.id))::int
                                                                    as coberturas_faltantes,
           coalesce(btrim(p.resumen), '') <> ''                     as tiene_resumen,
           coalesce(btrim(p.descripcion), '') <> ''                 as tiene_descripcion,
           coalesce(btrim(p.ideal_para), '') <> ''                  as tiene_ideal_para,
           (select count(*) from svas.plan_requisito r where r.plan_id = p.id and r.activo)::int
                                                                    as n_requisitos,
           (select count(*) from svas.plan_exclusion x where x.plan_id = p.id and x.activa)::int
                                                                    as n_exclusiones,
           (select count(*) from svas.fn_incoherencias_plan(p.id))::int
                                                                    as incoherencias_prueba_choque,
           p.contenido_actualizado_en
      from svas.plan p
      join svas.aseguradora a on a.id = p.aseguradora_id
     where (select svas.rol_actual()) = 'ADMINISTRADOR'
  ) v;

-- ── Contenido de un plan como JSON (antes/después de la bitácora) ───────────
create or replace function svas._contenido_plan_json(p_plan_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = svas, public
as $$
  select jsonb_build_object(
    'resumen', p.resumen,
    'descripcion', p.descripcion,
    'ideal_para', p.ideal_para,
    'coberturas', coalesce((
      select jsonb_agg(jsonb_build_object('codigo', c.codigo, 'incluida', pc.incluida,
                                          'detalle', pc.detalle, 'limite_monto', pc.limite_monto)
                       order by c.orden, c.codigo)
        from svas.plan_cobertura pc join svas.cobertura c on c.id = pc.cobertura_id
       where pc.plan_id = p.id), '[]'::jsonb),
    'exclusiones', coalesce((
      select jsonb_agg(x.texto order by x.orden) from svas.plan_exclusion x
       where x.plan_id = p.id and x.activa), '[]'::jsonb),
    'requisitos', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', r.tipo, 'texto', r.texto, 'obligatorio', r.obligatorio)
                       order by r.orden) from svas.plan_requisito r
       where r.plan_id = p.id and r.activo), '[]'::jsonb))
  from svas.plan p
 where p.id = p_plan_id;
$$;

-- ── Guardar el contenido de un plan (todo o nada, §6.12) ────────────────────
-- p_payload: { resumen, descripcion, ideal_para,
--              coberturas: [{ codigo, incluida, detalle?, limite_monto? }]  ← las activas, todas
--              exclusiones: [texto], requisitos: [{ tipo, texto, obligatorio? }] }
-- Devuelve { plan_id, cambio, advertencias: [{ codigo, nombre, incluida, escenarios_que_cubren }] }.
-- Las advertencias (RN-43) no impiden guardar.
create or replace function svas.admin_guardar_plan_contenido(p_plan_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_mala    text;
  v_antes   jsonb;
  v_despues jsonb;
  v_cambio  boolean;
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);

  perform 1 from svas.plan where id = p_plan_id for update;
  if not found then
    raise exception 'El plan no existe' using errcode = 'P0002';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'El contenido del plan debe ser un objeto JSON';
  end if;

  -- Textos (RN-42: los tres son obligatorios)
  if jsonb_typeof(p_payload->'resumen') is distinct from 'string'
     or btrim(p_payload->>'resumen') = '' or length(btrim(p_payload->>'resumen')) > 160 then
    raise exception 'El resumen es obligatorio (máximo 160 caracteres)';
  end if;
  if jsonb_typeof(p_payload->'descripcion') is distinct from 'string'
     or btrim(p_payload->>'descripcion') = '' or length(btrim(p_payload->>'descripcion')) > 1000 then
    raise exception 'La descripción es obligatoria (máximo 1000 caracteres)';
  end if;
  if jsonb_typeof(p_payload->'ideal_para') is distinct from 'string'
     or btrim(p_payload->>'ideal_para') = '' or length(btrim(p_payload->>'ideal_para')) > 200 then
    raise exception 'El campo "ideal para" es obligatorio (máximo 200 caracteres)';
  end if;

  -- Coberturas
  if jsonb_typeof(p_payload->'coberturas') is distinct from 'array' then
    raise exception 'Indica las coberturas del plan';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_payload->'coberturas') f
     where jsonb_typeof(f) <> 'object'
        or jsonb_typeof(f->'codigo') is distinct from 'string'
        or jsonb_typeof(f->'incluida') is distinct from 'boolean'
        or coalesce(jsonb_typeof(f->'detalle'), 'null') not in ('null', 'string')
        or coalesce(jsonb_typeof(f->'limite_monto'), 'null') not in ('null', 'number')
  ) then
    raise exception 'Cada cobertura necesita codigo e incluida; detalle es texto o null y limite_monto un número o null';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_payload->'coberturas') f
     where (f->>'detalle') is not null
       and (btrim(f->>'detalle') = '' or length(btrim(f->>'detalle')) > 200)
  ) then
    raise exception 'El detalle de una cobertura no puede estar vacío ni pasar de 200 caracteres';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_payload->'coberturas') f
     where (f->>'limite_monto')::numeric not between 0.01 and 9999999999.99
  ) then
    raise exception 'El límite de una cobertura debe ser mayor que 0';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_payload->'coberturas') f
     where not (f->>'incluida')::boolean and (f->>'limite_monto') is not null
  ) then
    raise exception 'Una cobertura que el plan no incluye no lleva límite';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_payload->'coberturas') f
     group by f->>'codigo' having count(*) > 1
  ) then
    raise exception 'Hay coberturas repetidas';
  end if;

  select f->>'codigo' into v_mala
    from jsonb_array_elements(p_payload->'coberturas') f
   where not exists (select 1 from svas.cobertura c where c.codigo = f->>'codigo' and c.activa)
   limit 1;
  if v_mala is not null then
    raise exception 'La cobertura % no existe o está inactiva', v_mala;
  end if;

  -- RN-42: todas las activas, sí o no.
  select string_agg(c.codigo, ', ' order by c.orden) into v_mala
    from svas.cobertura c
   where c.activa
     and not exists (select 1 from jsonb_array_elements(p_payload->'coberturas') f
                      where f->>'codigo' = c.codigo);
  if v_mala is not null then
    raise exception 'Faltan coberturas por definir (sí o no): %', v_mala;
  end if;

  -- Exclusiones
  if jsonb_typeof(p_payload->'exclusiones') is distinct from 'array'
     or jsonb_array_length(p_payload->'exclusiones') = 0 then
    raise exception 'Indica al menos una exclusión';
  end if;
  if jsonb_array_length(p_payload->'exclusiones') > 30 then
    raise exception 'Máximo 30 exclusiones por plan';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_payload->'exclusiones') x
     where jsonb_typeof(x) <> 'string' or btrim(x #>> '{}') = '' or length(btrim(x #>> '{}')) > 240
  ) then
    raise exception 'Cada exclusión es un texto de hasta 240 caracteres';
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_payload->'exclusiones') x
     group by btrim(x) having count(*) > 1
  ) then
    raise exception 'Hay exclusiones repetidas';
  end if;

  -- Requisitos
  if jsonb_typeof(p_payload->'requisitos') is distinct from 'array'
     or jsonb_array_length(p_payload->'requisitos') = 0 then
    raise exception 'Indica al menos un requisito';
  end if;
  if jsonb_array_length(p_payload->'requisitos') > 20 then
    raise exception 'Máximo 20 requisitos por plan';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_payload->'requisitos') r
     where jsonb_typeof(r) <> 'object'
        or coalesce(r->>'tipo', '') not in ('VEHICULO', 'CONDUCTOR', 'DOCUMENTO', 'INSPECCION')
        or jsonb_typeof(r->'texto') is distinct from 'string'
        or btrim(r->>'texto') = '' or length(btrim(r->>'texto')) > 240
        or coalesce(jsonb_typeof(r->'obligatorio'), 'boolean') <> 'boolean'
  ) then
    raise exception 'Cada requisito necesita tipo (VEHICULO, CONDUCTOR, DOCUMENTO o INSPECCION) y un texto de hasta 240 caracteres';
  end if;

  -- Reemplazo completo (cada orden guarda su propia copia, RN-45)
  v_antes := svas._contenido_plan_json(p_plan_id);

  delete from svas.plan_cobertura where plan_id = p_plan_id;
  delete from svas.plan_exclusion where plan_id = p_plan_id;
  delete from svas.plan_requisito where plan_id = p_plan_id;

  insert into svas.plan_cobertura (plan_id, cobertura_id, incluida, detalle, limite_monto)
  select p_plan_id, c.id, (f->>'incluida')::boolean,
         nullif(btrim(f->>'detalle'), ''), round((f->>'limite_monto')::numeric, 2)
    from jsonb_array_elements(p_payload->'coberturas') f
    join svas.cobertura c on c.codigo = f->>'codigo';

  insert into svas.plan_exclusion (plan_id, texto, orden)
  select p_plan_id, btrim(x), n::smallint
    from jsonb_array_elements_text(p_payload->'exclusiones') with ordinality t(x, n);

  insert into svas.plan_requisito (plan_id, tipo, texto, obligatorio, orden)
  select p_plan_id, r->>'tipo', btrim(r->>'texto'),
         coalesce((r->>'obligatorio')::boolean, true), n::smallint
    from jsonb_array_elements(p_payload->'requisitos') with ordinality t(r, n);

  update svas.plan
     set resumen     = btrim(p_payload->>'resumen'),
         descripcion = btrim(p_payload->>'descripcion'),
         ideal_para  = btrim(p_payload->>'ideal_para')
   where id = p_plan_id;

  v_despues := svas._contenido_plan_json(p_plan_id);
  v_cambio := v_antes is distinct from v_despues;

  if v_cambio then
    update svas.plan set contenido_actualizado_en = now() where id = p_plan_id;
    insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(), 'GUARDAR_CONTENIDO_PLAN', 'plan', p_plan_id,
            jsonb_build_object('antes', v_antes, 'despues', v_despues));
  end if;

  return jsonb_build_object(
    'plan_id', p_plan_id,
    'cambio', v_cambio,
    'advertencias', coalesce((select jsonb_agg(to_jsonb(i)) from svas.fn_incoherencias_plan(p_plan_id) i),
                             '[]'::jsonb));
end;
$$;

-- ── Advertencias RN-43 de un plan (lectura para la pantalla del admin) ──────
create or replace function svas.admin_incoherencias_plan(p_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = svas, public
as $$
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);
  return coalesce((select jsonb_agg(to_jsonb(i)) from svas.fn_incoherencias_plan(p_plan_id) i),
                  '[]'::jsonb);
end;
$$;

-- ── Crear o editar una cobertura del catálogo (por código) ──────────────────
-- p_payload: { nombre, categoria, descripcion, orden, activa, escenarios: [codigo] }
-- Una cobertura nueva y activa deja incompletos los planes hasta que se defina
-- su fila (la vista lo marca); se devuelve cuántos planes activos quedan así.
create or replace function svas.admin_guardar_cobertura_catalogo(p_codigo text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_antes      jsonb;
  v_despues    jsonb;
  v_id         uuid;
  v_mala       text;
  v_pendientes int;
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);

  if p_codigo is null or p_codigo !~ '^[A-Z][A-Z_]{1,29}$' then
    raise exception 'El código de la cobertura va en mayúsculas y guiones bajos (p. ej. ROBO_TOTAL)';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Los datos de la cobertura deben ser un objeto JSON';
  end if;
  if jsonb_typeof(p_payload->'nombre') is distinct from 'string'
     or btrim(p_payload->>'nombre') = '' or length(btrim(p_payload->>'nombre')) > 80 then
    raise exception 'El nombre de la cobertura es obligatorio (máximo 80 caracteres)';
  end if;
  if coalesce(p_payload->>'categoria', '') not in ('DANOS_PROPIOS', 'ROBO', 'RESPONSABILIDAD', 'ASISTENCIA', 'ADICIONAL') then
    raise exception 'La categoría debe ser DANOS_PROPIOS, ROBO, RESPONSABILIDAD, ASISTENCIA o ADICIONAL';
  end if;
  if jsonb_typeof(p_payload->'descripcion') is distinct from 'string'
     or btrim(p_payload->>'descripcion') = '' or length(btrim(p_payload->>'descripcion')) > 300 then
    raise exception 'La descripción de la cobertura es obligatoria (máximo 300 caracteres)';
  end if;
  if jsonb_typeof(p_payload->'orden') is distinct from 'number'
     or (p_payload->>'orden')::numeric % 1 <> 0
     or (p_payload->>'orden')::numeric not between 0 and 1000 then
    raise exception 'El orden debe ser un entero entre 0 y 1000';
  end if;
  if jsonb_typeof(p_payload->'activa') is distinct from 'boolean' then
    raise exception 'Indica si la cobertura está activa (true o false)';
  end if;
  if jsonb_typeof(p_payload->'escenarios') is distinct from 'array'
     or exists (select 1 from jsonb_array_elements(p_payload->'escenarios') e
                 where jsonb_typeof(e) <> 'string') then
    raise exception 'escenarios debe ser una lista de códigos de la Prueba de Choque (puede ir vacía)';
  end if;
  select e into v_mala from jsonb_array_elements_text(p_payload->'escenarios') e
   where not exists (select 1 from svas.escenario_siniestro s where s.codigo = e) limit 1;
  if v_mala is not null then
    raise exception 'El escenario % no existe', v_mala using errcode = 'P0002';
  end if;

  select id into v_id from svas.cobertura where codigo = p_codigo for update;
  if v_id is not null then
    select to_jsonb(c) - 'id' || jsonb_build_object('escenarios', coalesce((
             select jsonb_agg(s.codigo order by s.codigo) from svas.cobertura_escenario ce
               join svas.escenario_siniestro s on s.id = ce.escenario_id
              where ce.cobertura_id = c.id), '[]'::jsonb))
      into v_antes from svas.cobertura c where c.id = v_id;
  end if;

  insert into svas.cobertura (codigo, nombre, categoria, descripcion, orden, activa)
  values (p_codigo, btrim(p_payload->>'nombre'), p_payload->>'categoria',
          btrim(p_payload->>'descripcion'), (p_payload->>'orden')::smallint,
          (p_payload->>'activa')::boolean)
  on conflict (codigo) do update
    set nombre = excluded.nombre, categoria = excluded.categoria,
        descripcion = excluded.descripcion, orden = excluded.orden, activa = excluded.activa
  returning id into v_id;

  delete from svas.cobertura_escenario where cobertura_id = v_id;
  insert into svas.cobertura_escenario (cobertura_id, escenario_id)
  select v_id, s.id from svas.escenario_siniestro s
   where s.codigo in (select jsonb_array_elements_text(p_payload->'escenarios'));

  select to_jsonb(c) - 'id' || jsonb_build_object('escenarios', coalesce((
           select jsonb_agg(s.codigo order by s.codigo) from svas.cobertura_escenario ce
             join svas.escenario_siniestro s on s.id = ce.escenario_id
            where ce.cobertura_id = c.id), '[]'::jsonb))
    into v_despues from svas.cobertura c where c.id = v_id;

  if v_antes is distinct from v_despues then
    insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(),
            case when v_antes is null then 'CREAR_COBERTURA' else 'GUARDAR_COBERTURA' end,
            'cobertura', v_id, jsonb_build_object('antes', v_antes, 'despues', v_despues));
  end if;

  select count(*) into v_pendientes
    from svas.plan p join svas.aseguradora a on a.id = p.aseguradora_id
   where p.activo and a.activa and (p_payload->>'activa')::boolean
     and not exists (select 1 from svas.plan_cobertura pc where pc.plan_id = p.id and pc.cobertura_id = v_id);

  return v_despues || jsonb_build_object('id', v_id, 'planes_sin_definir', v_pendientes);
end;
$$;

-- ── admin_cambiar_estado_plan v2: no se activa un plan incompleto (RN-42) ───
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
  v_c       svas.v_plan_contenido_completitud;
  v_falta   text[] := '{}';
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);

  select * into v_antes from svas.plan where id = p_plan_id for update;
  if not found then
    raise exception 'El plan no existe' using errcode = 'P0002';
  end if;

  if v_antes.activo = p_activo then
    return to_jsonb(v_antes);
  end if;

  if p_activo then
    select * into v_c from svas.v_plan_contenido_completitud where plan_id = p_plan_id;
    if not coalesce(v_c.completo, false) then
      if v_c.coberturas_faltantes > 0 then
        v_falta := v_falta || format('faltan %s coberturas por definir', v_c.coberturas_faltantes);
      end if;
      if not (v_c.tiene_resumen and v_c.tiene_descripcion and v_c.tiene_ideal_para) then
        v_falta := v_falta || 'falta el resumen, la descripción o el "ideal para"'::text;
      end if;
      if v_c.n_requisitos = 0 then v_falta := v_falta || 'no tiene requisitos'::text; end if;
      if v_c.n_exclusiones = 0 then v_falta := v_falta || 'no tiene exclusiones'::text; end if;
      if v_c.incoherencias_prueba_choque > 0 then
        v_falta := v_falta || format('%s coberturas contradicen a la Prueba de Choque',
                                     v_c.incoherencias_prueba_choque);
      end if;
      raise exception 'No puedes activar este plan: %.', array_to_string(v_falta, '; ');
    end if;
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

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table svas.cobertura           enable row level security;
alter table svas.cobertura_escenario enable row level security;
alter table svas.plan_cobertura      enable row level security;
alter table svas.plan_exclusion      enable row level security;
alter table svas.plan_requisito      enable row level security;

-- Contenido público para cualquier usuario autenticado (RN-46); el admin ve todo.
create policy cobertura_select on svas.cobertura
  for select to authenticated
  using (activa or (select svas.rol_actual()) = 'ADMINISTRADOR');

create policy cobertura_escenario_select on svas.cobertura_escenario
  for select to authenticated using (true);

create policy plan_cobertura_select on svas.plan_cobertura
  for select to authenticated
  using ((select svas.rol_actual()) = 'ADMINISTRADOR'
         or exists (select 1 from svas.plan p join svas.aseguradora a on a.id = p.aseguradora_id
                     where p.id = plan_id and p.activo and a.activa));

create policy plan_exclusion_select on svas.plan_exclusion
  for select to authenticated
  using ((select svas.rol_actual()) = 'ADMINISTRADOR'
         or (activa and exists (select 1 from svas.plan p join svas.aseguradora a on a.id = p.aseguradora_id
                                 where p.id = plan_id and p.activo and a.activa)));

create policy plan_requisito_select on svas.plan_requisito
  for select to authenticated
  using ((select svas.rol_actual()) = 'ADMINISTRADOR'
         or (activo and exists (select 1 from svas.plan p join svas.aseguradora a on a.id = p.aseguradora_id
                                 where p.id = plan_id and p.activo and a.activa)));

-- ── Permisos ────────────────────────────────────────────────────────────────
revoke all on svas.cobertura, svas.cobertura_escenario, svas.plan_cobertura,
              svas.plan_exclusion, svas.plan_requisito, svas.v_plan_contenido_completitud
  from public, anon, authenticated;

grant select on svas.cobertura, svas.cobertura_escenario, svas.plan_cobertura,
                svas.plan_exclusion, svas.plan_requisito, svas.v_plan_contenido_completitud
  to authenticated;
grant select on svas.cobertura, svas.cobertura_escenario, svas.plan_cobertura,
                svas.plan_exclusion, svas.plan_requisito
  to service_role;

-- Internas: solo las usan la vista y los RPC (corren como dueño).
revoke execute on function svas.fn_incoherencias_plan(uuid) from public, anon, authenticated;
revoke execute on function svas._contenido_plan_json(uuid) from public, anon, authenticated;

revoke execute on function svas.admin_guardar_plan_contenido(uuid, jsonb) from public, anon;
revoke execute on function svas.admin_incoherencias_plan(uuid) from public, anon;
revoke execute on function svas.admin_guardar_cobertura_catalogo(text, jsonb) from public, anon;
revoke execute on function svas.admin_cambiar_estado_plan(uuid, boolean) from public, anon;

grant execute on function svas.admin_guardar_plan_contenido(uuid, jsonb) to authenticated;
grant execute on function svas.admin_incoherencias_plan(uuid) to authenticated;
grant execute on function svas.admin_guardar_cobertura_catalogo(text, jsonb) to authenticated;
grant execute on function svas.admin_cambiar_estado_plan(uuid, boolean) to authenticated;

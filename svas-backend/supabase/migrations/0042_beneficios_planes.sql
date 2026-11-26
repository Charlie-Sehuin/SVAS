-- 0042 · Beneficios de los planes (extra a las coberturas): visitas técnicas, grúa, combustible, etc.
-- Pedido del profesor tras la exposición (2026-11-26): "además de lo que cubre, ¿incluyen beneficios?".
-- Propuesta: docs/propuesta-beneficios-planes.pdf. Cada aseguradora y cada plan ofrece SUS beneficios.
--
--   · beneficio       catálogo común (tipo CANTIDAD / PRECIO / PORCENTAJE y su unidad)
--   · plan_beneficio  solo los beneficios que ESE plan ofrece, con su valor. Ausencia = "no incluye"
--                     (a diferencia de plan_cobertura, aquí no hay fila "no" porque los beneficios
--                     son propios de cada aseguradora).
--   · fn_incoherencias_escalera: el plan superior de una aseguradora debe incluir todo lo del inferior,
--                     con igual o mejor valor (regla pedida por Charlie). Solo advierte, no bloquea.
--   · admin_guardar_beneficios_plan: el administrador guarda los beneficios de un plan (todo o nada).
-- Los valores sembrados son ESTIMADOS (RN-26), igual que las tarifas.
-- Lectura pública: el visitante la recibe del backend con service_role; con JWT, por RLS.

-- ── Tablas ──────────────────────────────────────────────────────────────────
create table svas.beneficio (
  id     uuid primary key default gen_random_uuid(),
  codigo varchar(30) not null,
  nombre varchar(100) not null,
  tipo   varchar(10) not null,
  unidad varchar(30) not null,
  orden  smallint    not null default 0,
  activo boolean     not null default true,
  constraint uq_beneficio_codigo unique (codigo),
  constraint ck_beneficio_codigo check (codigo ~ '^[A-Z][A-Z_]{1,29}$'),
  constraint ck_beneficio_tipo   check (tipo in ('CANTIDAD', 'PRECIO', 'PORCENTAJE')),
  constraint ck_beneficio_textos check (btrim(nombre) <> '' and btrim(unidad) <> '')
);

create table svas.plan_beneficio (
  plan_id      uuid          not null references svas.plan (id) on delete cascade,
  beneficio_id uuid          not null references svas.beneficio (id) on delete restrict,
  valor        numeric(10,2) not null,
  detalle      varchar(200)  null,
  primary key (plan_id, beneficio_id),
  constraint ck_plan_beneficio_valor   check (valor > 0),
  constraint ck_plan_beneficio_detalle check (detalle is null or btrim(detalle) <> '')
);

create index ix_plan_beneficio_beneficio on svas.plan_beneficio (beneficio_id);

-- ── Escalera: lo que el plan superior no cumple frente al inferior ──────────
-- "Superior" = mayor tasa_base dentro de la misma aseguradora. Un beneficio del plan inferior debe
-- estar en el superior con cantidad/porcentaje igual o mayor, o con precio igual o menor.
create or replace function svas.fn_incoherencias_escalera(p_plan_id uuid)
returns table (codigo varchar, nombre varchar, plan_bajo varchar, plan_alto varchar, motivo text)
language sql
stable
security definer
set search_path = svas, public
as $$
  with par as (
    select case when ta.tasa_base < tb.tasa_base then a.id else b.id end as bajo,
           case when ta.tasa_base < tb.tasa_base then b.id else a.id end as alto
      from svas.plan a
      join svas.plan b on b.aseguradora_id = a.aseguradora_id and b.id <> a.id
      join svas.tarifa_plan ta on ta.plan_id = a.id
      join svas.tarifa_plan tb on tb.plan_id = b.id
     where a.id = p_plan_id and ta.tasa_base <> tb.tasa_base
  )
  select be.codigo, be.nombre, pb.nombre, pa.nombre,
         case when xa.valor is null then 'el plan superior no incluye este beneficio'
              when be.tipo = 'PRECIO' then 'el plan superior cobra más por unidad'
              else 'el plan superior da menos' end
    from par
    join svas.plan_beneficio xb on xb.plan_id = par.bajo
    join svas.beneficio be      on be.id = xb.beneficio_id and be.activo
    join svas.plan pb           on pb.id = par.bajo
    join svas.plan pa           on pa.id = par.alto
    left join svas.plan_beneficio xa
           on xa.plan_id = par.alto and xa.beneficio_id = xb.beneficio_id
   where xa.valor is null
      or (be.tipo = 'PRECIO' and xa.valor > xb.valor)
      or (be.tipo <> 'PRECIO' and xa.valor < xb.valor)
   order by be.orden;
$$;

-- ── Beneficios de un plan como JSON (antes/después de la bitácora) ──────────
create or replace function svas._beneficios_plan_json(p_plan_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = svas, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('codigo', b.codigo, 'valor', pb.valor, 'detalle', pb.detalle)
                            order by b.orden, b.codigo), '[]'::jsonb)
    from svas.plan_beneficio pb
    join svas.beneficio b on b.id = pb.beneficio_id
   where pb.plan_id = p_plan_id;
$$;

-- ── Guardar los beneficios de un plan (todo o nada) ─────────────────────────
-- p_beneficios: [{ codigo, valor, detalle? }]  (lista vacía = el plan no ofrece beneficios)
-- Devuelve { plan_id, cambio, advertencias: [{ codigo, nombre, plan_bajo, plan_alto, motivo }] }.
create or replace function svas.admin_guardar_beneficios_plan(p_plan_id uuid, p_beneficios jsonb)
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

  if jsonb_typeof(p_beneficios) is distinct from 'array' then
    raise exception 'Los beneficios deben ser una lista';
  end if;
  if jsonb_array_length(p_beneficios) > 20 then
    raise exception 'Máximo 20 beneficios por plan';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_beneficios) f
     where jsonb_typeof(f) <> 'object'
        or jsonb_typeof(f->'codigo') is distinct from 'string'
        or jsonb_typeof(f->'valor') is distinct from 'number'
        or coalesce(jsonb_typeof(f->'detalle'), 'null') not in ('null', 'string')
  ) then
    raise exception 'Cada beneficio necesita codigo y valor numérico; detalle es texto o null';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_beneficios) f
     where (f->>'valor')::numeric not between 0.01 and 99999999.99
  ) then
    raise exception 'El valor de un beneficio debe ser mayor que 0';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_beneficios) f
     where (f->>'detalle') is not null
       and (btrim(f->>'detalle') = '' or length(btrim(f->>'detalle')) > 200)
  ) then
    raise exception 'El detalle de un beneficio no puede estar vacío ni pasar de 200 caracteres';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_beneficios) f
     group by f->>'codigo' having count(*) > 1
  ) then
    raise exception 'Hay beneficios repetidos';
  end if;

  select f->>'codigo' into v_mala
    from jsonb_array_elements(p_beneficios) f
   where not exists (select 1 from svas.beneficio b where b.codigo = f->>'codigo' and b.activo)
   limit 1;
  if v_mala is not null then
    raise exception 'El beneficio % no existe o está inactivo', v_mala;
  end if;

  select b.codigo into v_mala
    from jsonb_array_elements(p_beneficios) f
    join svas.beneficio b on b.codigo = f->>'codigo'
   where b.tipo = 'PORCENTAJE' and (f->>'valor')::numeric > 100
   limit 1;
  if v_mala is not null then
    raise exception 'El porcentaje de % no puede pasar de 100', v_mala;
  end if;

  v_antes := svas._beneficios_plan_json(p_plan_id);

  delete from svas.plan_beneficio where plan_id = p_plan_id;
  insert into svas.plan_beneficio (plan_id, beneficio_id, valor, detalle)
  select p_plan_id, b.id, round((f->>'valor')::numeric, 2), nullif(btrim(f->>'detalle'), '')
    from jsonb_array_elements(p_beneficios) f
    join svas.beneficio b on b.codigo = f->>'codigo';

  v_despues := svas._beneficios_plan_json(p_plan_id);
  v_cambio := v_antes is distinct from v_despues;

  if v_cambio then
    update svas.plan set contenido_actualizado_en = now() where id = p_plan_id;
    insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(), 'GUARDAR_BENEFICIOS_PLAN', 'plan', p_plan_id,
            jsonb_build_object('antes', v_antes, 'despues', v_despues));
  end if;

  return jsonb_build_object(
    'plan_id', p_plan_id,
    'cambio', v_cambio,
    'advertencias', coalesce((select jsonb_agg(to_jsonb(i)) from svas.fn_incoherencias_escalera(p_plan_id) i),
                             '[]'::jsonb));
end;
$$;

-- Advertencias de escalera de un plan (lectura para la pantalla del admin).
create or replace function svas.admin_incoherencias_escalera(p_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = svas, public
as $$
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);
  return coalesce((select jsonb_agg(to_jsonb(i)) from svas.fn_incoherencias_escalera(p_plan_id) i),
                  '[]'::jsonb);
end;
$$;

-- ── Datos iniciales (ESTIMADOS) ─────────────────────────────────────────────
insert into svas.beneficio (codigo, nombre, tipo, unidad, orden) values
  ('VISITAS_TECNICAS',     'Visitas técnicas',                                         'CANTIDAD',   'al año',          1),
  ('COMBUSTIBLE',          'Combustible en grifos aliados',                            'PRECIO',     'USD por litro',   2),
  ('GRUA',                 'Grúa y auxilio mecánico',                                  'CANTIDAD',   'veces al año',    3),
  ('ASISTENCIA_CARRETERA', 'Asistencia en carretera (llanta, batería, combustible)',   'CANTIDAD',   'veces al año',    4),
  ('CONDUCTOR_ELEGIDO',    'Conductor elegido',                                        'CANTIDAD',   'veces al año',    5),
  ('LAVADO',               'Lavado del auto',                                          'CANTIDAD',   'veces al año',    6),
  ('REVISION_TECNICA',     'Gestión de la revisión técnica vehicular',                 'CANTIDAD',   'trámites al año', 7),
  ('CHEQUEO_PREVENTIVO',   'Chequeo preventivo de 20 puntos',                          'CANTIDAD',   'veces al año',    8),
  ('CAMBIO_ACEITE',        'Cambio de aceite gratis',                                  'CANTIDAD',   'veces al año',    9),
  ('DSCTO_LLANTAS',        'Descuento en llantas y baterías',                          'PORCENTAJE', '% de descuento', 10),
  ('DSCTO_TALLERES',       'Descuento en talleres afiliados (mano de obra)',           'PORCENTAJE', '% de descuento', 11),
  ('TAXI',                 'Traslado en taxi mientras el auto está en el taller',      'CANTIDAD',   'viajes al año',  12);

insert into svas.plan_beneficio (plan_id, beneficio_id, valor)
select p.id, b.id, v.valor
  from (values
    ('Rímac', 'Plata', 'VISITAS_TECNICAS', 2), ('Rímac', 'Plata', 'COMBUSTIBLE', 1.30), ('Rímac', 'Plata', 'GRUA', 2),
    ('Rímac', 'Oro', 'VISITAS_TECNICAS', 4), ('Rímac', 'Oro', 'COMBUSTIBLE', 1.00), ('Rímac', 'Oro', 'GRUA', 4),
    ('Rímac', 'Oro', 'CONDUCTOR_ELEGIDO', 2),
    ('Pacífico', 'Básico', 'VISITAS_TECNICAS', 2), ('Pacífico', 'Básico', 'COMBUSTIBLE', 2.80),
    ('Pacífico', 'Premium', 'VISITAS_TECNICAS', 5), ('Pacífico', 'Premium', 'COMBUSTIBLE', 2.50),
    ('Pacífico', 'Premium', 'LAVADO', 6), ('Pacífico', 'Premium', 'REVISION_TECNICA', 1),
    ('La Positiva', 'Clásico', 'VISITAS_TECNICAS', 1), ('La Positiva', 'Clásico', 'GRUA', 2),
    ('La Positiva', 'Full', 'VISITAS_TECNICAS', 3), ('La Positiva', 'Full', 'GRUA', 3),
    ('La Positiva', 'Full', 'DSCTO_LLANTAS', 12), ('La Positiva', 'Full', 'CHEQUEO_PREVENTIVO', 2),
    ('Mapfre', 'Esencial', 'VISITAS_TECNICAS', 1), ('Mapfre', 'Esencial', 'ASISTENCIA_CARRETERA', 1),
    ('Mapfre', 'Total', 'VISITAS_TECNICAS', 3), ('Mapfre', 'Total', 'ASISTENCIA_CARRETERA', 3),
    ('Mapfre', 'Total', 'CAMBIO_ACEITE', 2), ('Mapfre', 'Total', 'DSCTO_TALLERES', 10),
    ('Qualitas', 'Estándar', 'VISITAS_TECNICAS', 2), ('Qualitas', 'Estándar', 'COMBUSTIBLE', 2.20),
    ('Qualitas', 'Estándar', 'DSCTO_TALLERES', 5),
    ('Qualitas', 'Plus', 'VISITAS_TECNICAS', 4), ('Qualitas', 'Plus', 'COMBUSTIBLE', 1.90),
    ('Qualitas', 'Plus', 'DSCTO_TALLERES', 12), ('Qualitas', 'Plus', 'TAXI', 4)
  ) as v(aseguradora, plan, codigo, valor)
  join svas.aseguradora a on a.nombre = v.aseguradora
  join svas.plan p        on p.aseguradora_id = a.id and p.nombre = v.plan
  join svas.beneficio b   on b.codigo = v.codigo;

-- Verificación: las 32 filas entraron y la escalera se cumple en las 5 aseguradoras.
do $$
declare
  v_n int;
  v_mal int;
begin
  select count(*) into v_n from svas.plan_beneficio;
  if v_n <> 32 then
    raise exception 'Se esperaban 32 filas de plan_beneficio y hay % (¿cambió el nombre de un plan?)', v_n;
  end if;
  select count(*) into v_mal
    from svas.plan p, lateral svas.fn_incoherencias_escalera(p.id);
  if v_mal > 0 then
    raise exception 'La escalera de beneficios no se cumple en % casos', v_mal;
  end if;
end;
$$;

-- ── RLS y permisos ──────────────────────────────────────────────────────────
alter table svas.beneficio      enable row level security;
alter table svas.plan_beneficio enable row level security;

create policy beneficio_select on svas.beneficio
  for select to authenticated
  using (activo or (select svas.rol_actual()) = 'ADMINISTRADOR');

create policy plan_beneficio_select on svas.plan_beneficio
  for select to authenticated
  using ((select svas.rol_actual()) = 'ADMINISTRADOR'
         or exists (select 1 from svas.plan p join svas.aseguradora a on a.id = p.aseguradora_id
                     where p.id = plan_id and p.activo and a.activa));

revoke all on svas.beneficio, svas.plan_beneficio from public, anon, authenticated;
grant select on svas.beneficio, svas.plan_beneficio to authenticated;
grant select on svas.beneficio, svas.plan_beneficio to service_role;

revoke execute on function svas.fn_incoherencias_escalera(uuid) from public, anon, authenticated;
revoke execute on function svas._beneficios_plan_json(uuid) from public, anon, authenticated;
revoke execute on function svas.admin_guardar_beneficios_plan(uuid, jsonb) from public, anon;
revoke execute on function svas.admin_incoherencias_escalera(uuid) from public, anon;
grant execute on function svas.admin_guardar_beneficios_plan(uuid, jsonb) to authenticated;
grant execute on function svas.admin_incoherencias_escalera(uuid) to authenticated;

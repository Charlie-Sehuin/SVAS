-- 0006 · Tarifas (D7): tarifa_plan, rango_suma_asegurada, peso_marca, peso_modelo,
--        peso_anio, peso_tipo, peso_ubigeo, vista v_tarifa_completitud + RLS
-- Fuente: contexto §4.1 (D7), §5 (RN-37, RN-39, RN-40), §7, §17.
--
-- Secreto comercial del corredor: SELECT solo ADMINISTRADOR. El backend las lee
-- con service_role para cotizar (TarifaSupabaseRepository). Las tablas guardan
-- solo datos; las fórmulas viven en las Estrategias de TypeScript (RN-40).

-- ── tarifa_plan (1:1 con plan) ──────────────────────────────────────────────
create table svas.tarifa_plan (
  plan_id        uuid primary key references svas.plan (id) on delete restrict,
  tasa_base      numeric(6,4) not null,
  parametros     jsonb        not null default '{}'::jsonb,
  actualizado_en timestamptz  not null default now(),
  constraint ck_tasa_base check (tasa_base > 0 and tasa_base < 1),
  constraint ck_tarifa_parametros check (jsonb_typeof(parametros) = 'object')
);

comment on column svas.tarifa_plan.parametros is
  'Parámetros de la fórmula de la aseguradora; los valida el zod de su Estrategia.';

-- ── rango_suma_asegurada: la fila existe = la aseguradora cotiza ese modelo-año (RN-39)
create table svas.rango_suma_asegurada (
  aseguradora_id uuid          not null references svas.aseguradora (id) on delete restrict,
  modelo_id      uuid          not null references svas.modelo (id) on delete restrict,
  anio           smallint      not null,
  suma_minima    numeric(12,2) not null,
  suma_maxima    numeric(12,2) not null,
  constraint pk_rango_suma primary key (aseguradora_id, modelo_id, anio),
  constraint ck_rango check (suma_minima > 0 and suma_minima <= suma_maxima),
  constraint ck_rango_anio check (anio between 1950 and 2100)
);

create index ix_rango_modelo_anio on svas.rango_suma_asegurada (modelo_id, anio);

-- ── Pesos: aseguradora + clave + peso (0,500–3,000) ─────────────────────────
-- Una aseguradora solo tiene filas en las tablas que su fórmula usa.
create table svas.peso_marca (
  aseguradora_id uuid         not null references svas.aseguradora (id) on delete restrict,
  marca_id       uuid         not null references svas.marca (id) on delete restrict,
  peso           numeric(5,3) not null,
  constraint pk_peso_marca primary key (aseguradora_id, marca_id),
  constraint ck_peso_marca check (peso between 0.5 and 3)
);
create index ix_peso_marca_marca on svas.peso_marca (marca_id);

create table svas.peso_modelo (
  aseguradora_id uuid         not null references svas.aseguradora (id) on delete restrict,
  modelo_id      uuid         not null references svas.modelo (id) on delete restrict,
  peso           numeric(5,3) not null,
  constraint pk_peso_modelo primary key (aseguradora_id, modelo_id),
  constraint ck_peso_modelo check (peso between 0.5 and 3)
);
create index ix_peso_modelo_modelo on svas.peso_modelo (modelo_id);

create table svas.peso_anio (
  aseguradora_id uuid         not null references svas.aseguradora (id) on delete restrict,
  anio           smallint     not null,
  peso           numeric(5,3) not null,
  constraint pk_peso_anio primary key (aseguradora_id, anio),
  constraint ck_peso_anio check (peso between 0.5 and 3),
  constraint ck_peso_anio_anio check (anio between 1950 and 2100)
);

create table svas.peso_tipo (
  aseguradora_id uuid         not null references svas.aseguradora (id) on delete restrict,
  tipo_id        uuid         not null references svas.tipo_vehiculo (id) on delete restrict,
  peso           numeric(5,3) not null,
  constraint pk_peso_tipo primary key (aseguradora_id, tipo_id),
  constraint ck_peso_tipo check (peso between 0.5 and 3)
);
create index ix_peso_tipo_tipo on svas.peso_tipo (tipo_id);

create table svas.peso_ubigeo (
  aseguradora_id uuid         not null references svas.aseguradora (id) on delete restrict,
  ubigeo         char(6)      not null references svas.ubigeo (codigo) on delete restrict,
  peso           numeric(5,3) not null,
  constraint pk_peso_ubigeo primary key (aseguradora_id, ubigeo),
  constraint ck_peso_ubigeo check (peso between 0.5 and 3)
);
create index ix_peso_ubigeo_ubigeo on svas.peso_ubigeo (ubigeo);

-- ── RLS: solo ADMINISTRADOR (§7) ────────────────────────────────────────────
alter table svas.tarifa_plan          enable row level security;
alter table svas.rango_suma_asegurada enable row level security;
alter table svas.peso_marca           enable row level security;
alter table svas.peso_modelo          enable row level security;
alter table svas.peso_anio            enable row level security;
alter table svas.peso_tipo            enable row level security;
alter table svas.peso_ubigeo          enable row level security;

create policy tarifa_plan_select on svas.tarifa_plan
  for select to authenticated using ((select svas.rol_actual()) = 'ADMINISTRADOR');
create policy rango_suma_select on svas.rango_suma_asegurada
  for select to authenticated using ((select svas.rol_actual()) = 'ADMINISTRADOR');
create policy peso_marca_select on svas.peso_marca
  for select to authenticated using ((select svas.rol_actual()) = 'ADMINISTRADOR');
create policy peso_modelo_select on svas.peso_modelo
  for select to authenticated using ((select svas.rol_actual()) = 'ADMINISTRADOR');
create policy peso_anio_select on svas.peso_anio
  for select to authenticated using ((select svas.rol_actual()) = 'ADMINISTRADOR');
create policy peso_tipo_select on svas.peso_tipo
  for select to authenticated using ((select svas.rol_actual()) = 'ADMINISTRADOR');
create policy peso_ubigeo_select on svas.peso_ubigeo
  for select to authenticated using ((select svas.rol_actual()) = 'ADMINISTRADOR');

revoke all on svas.tarifa_plan, svas.rango_suma_asegurada, svas.peso_marca, svas.peso_modelo,
              svas.peso_anio, svas.peso_tipo, svas.peso_ubigeo
  from public, anon, authenticated;

grant select on svas.tarifa_plan, svas.rango_suma_asegurada, svas.peso_marca, svas.peso_modelo,
                svas.peso_anio, svas.peso_tipo, svas.peso_ubigeo
  to authenticated, service_role;

-- ── Vista de completitud (§17.9) ────────────────────────────────────────────
-- Por aseguradora × modelo × año (años presentes en algún rango): si tiene rango
-- y qué pesos de vehículo faltan. Qué pesos exige cada aseguradora lo decide su
-- Estrategia en el backend (RN-40), no esta vista. security_invoker: aplica la
-- RLS de quien consulta, y el filtro de rol la deja vacía para no administradores.
create view svas.v_tarifa_completitud
with (security_invoker = true)
as
with anios as (
  select distinct anio from svas.rango_suma_asegurada
)
select a.id                as aseguradora_id,
       a.codigo_estrategia,
       mo.id               as modelo_id,
       ma.nombre           as marca,
       mo.nombre           as modelo,
       an.anio,
       r.modelo_id is not null as tiene_rango,
       array_remove(array[
         case when pm.peso  is null then 'marca'  end,
         case when pmo.peso is null then 'modelo' end,
         case when pa.peso  is null then 'anio'   end,
         case when pt.peso  is null then 'tipo'   end
       ], null)            as pesos_faltantes
  from svas.aseguradora a
 cross join svas.modelo mo
  join svas.marca ma on ma.id = mo.marca_id
 cross join anios an
  left join svas.rango_suma_asegurada r
         on r.aseguradora_id = a.id and r.modelo_id = mo.id and r.anio = an.anio
  left join svas.peso_marca  pm  on pm.aseguradora_id  = a.id and pm.marca_id   = mo.marca_id
  left join svas.peso_modelo pmo on pmo.aseguradora_id = a.id and pmo.modelo_id = mo.id
  left join svas.peso_anio   pa  on pa.aseguradora_id  = a.id and pa.anio       = an.anio
  left join svas.peso_tipo   pt  on pt.aseguradora_id  = a.id and pt.tipo_id    = mo.tipo_id
 where a.activa
   and mo.activo
   and ma.activa
   and (select svas.rol_actual()) = 'ADMINISTRADOR';

revoke all on svas.v_tarifa_completitud from public, anon, authenticated;
grant select on svas.v_tarifa_completitud to authenticated, service_role;

-- 0004 · Catálogo y parámetros (D1): parametros_comerciales, aseguradora, plan,
--        campo_requerido, valor_permitido, regla_inspeccion + RLS
-- Fuente: contexto §4.1 (D1), §5 (RN-16, RN-17, RN-25), §7 (RLS).
--
-- Escritura: solo vía RPC admin (0015) o seed (0016). authenticated solo lee.
-- RN-16: el catálogo se desactiva, no se borra (sin DELETE salvo valor_permitido,
-- que borra el propio RPC admin_guardar_campo).

-- ── parametros_comerciales (fila única) ─────────────────────────────────────
create table svas.parametros_comerciales (
  id                       smallint primary key default 1,
  descuento_primera_compra numeric(5,2) not null default 5.00,
  descuento_maximo         numeric(5,2) not null default 10.00,
  max_intentos             smallint     not null default 4,
  dias_seguimiento         smallint     not null default 7,
  max_cuotas               smallint     not null default 12,
  vigencia_enlace_dias     smallint     not null default 7,
  horas_abandono           smallint     not null default 24,
  moneda                   char(3)      not null default 'USD',
  tipo_cambio_referencial  numeric(8,4) not null default 3.7500,
  constraint ck_parametros_fila_unica check (id = 1),
  constraint ck_parametros_descuentos check (
    descuento_primera_compra > 0
    and descuento_primera_compra <= descuento_maximo
    and descuento_maximo <= 100
  ),
  constraint ck_parametros_enteros check (
    max_intentos between 1 and 20
    and dias_seguimiento between 1 and 90
    and max_cuotas between 1 and 24
    and vigencia_enlace_dias between 1 and 90
    and horas_abandono between 1 and 720
  ),
  constraint ck_parametros_moneda check (moneda ~ '^[A-Z]{3}$'),
  constraint ck_parametros_tipo_cambio check (tipo_cambio_referencial > 0)
);

comment on table svas.parametros_comerciales is
  'Parámetros comerciales vigentes (fila única id = 1). Solo los edita el ADMINISTRADOR vía RPC.';

-- ── aseguradora ─────────────────────────────────────────────────────────────
create table svas.aseguradora (
  id                uuid primary key default gen_random_uuid(),
  nombre            varchar(60) not null,
  activa            boolean     not null default true,
  codigo_estrategia varchar(30) not null,
  constraint uq_aseguradora_nombre unique (nombre),
  constraint uq_aseguradora_estrategia unique (codigo_estrategia),
  constraint ck_aseguradora_estrategia check (codigo_estrategia ~ '^[A-Z][A-Z_]*$')
);

comment on column svas.aseguradora.codigo_estrategia is
  'Código con el que el backend resuelve la Estrategia de tarifa (RN-40).';

-- ── plan ────────────────────────────────────────────────────────────────────
-- resumen, ideal_para, orden y contenido_actualizado_en llegan en 0020 (D8).
create table svas.plan (
  id             uuid primary key default gen_random_uuid(),
  aseguradora_id uuid        not null references svas.aseguradora (id) on delete restrict,
  nombre         varchar(80) not null,
  descripcion    text,
  activo         boolean     not null default true,
  constraint uq_plan_aseguradora_nombre unique (aseguradora_id, nombre)
);

create index ix_plan_aseguradora on svas.plan (aseguradora_id);

-- ── campo_requerido (formulario dinámico, RN-17) ────────────────────────────
create table svas.campo_requerido (
  id              uuid primary key default gen_random_uuid(),
  aseguradora_id  uuid            not null references svas.aseguradora (id) on delete restrict,
  nombre          varchar(40)     not null,
  tipo            svas.tipo_campo not null,
  obligatorio     boolean         not null default true,
  activo          boolean         not null default true,
  origen_valores  varchar(10)     not null default 'ESTATICO',
  constraint uq_campo_aseguradora_nombre unique (aseguradora_id, nombre),
  constraint ck_campo_origen check (origen_valores in ('ESTATICO', 'CATALOGO')),
  constraint ck_campo_nombre check (nombre ~ '^[a-z][a-z0-9_]*$')
);

create index ix_campo_aseguradora on svas.campo_requerido (aseguradora_id);

-- ── valor_permitido (composición del campo) ─────────────────────────────────
create table svas.valor_permitido (
  id                 uuid primary key default gen_random_uuid(),
  campo_requerido_id uuid        not null references svas.campo_requerido (id) on delete cascade,
  valor              varchar(60) not null,
  constraint uq_valor_por_campo unique (campo_requerido_id, valor)
);

-- ── regla_inspeccion (RN-25) ────────────────────────────────────────────────
create table svas.regla_inspeccion (
  id                  uuid primary key default gen_random_uuid(),
  aseguradora_id      uuid              not null references svas.aseguradora (id) on delete restrict,
  uso                 svas.uso_vehiculo not null,
  requiere_inspeccion boolean           not null default false,
  constraint uq_regla_aseguradora_uso unique (aseguradora_id, uso)
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Catálogo: authenticated ve solo filas activas; el ADMINISTRADOR ve todo
-- (para poder reactivar). `(select ...)` evalúa rol_actual() una vez por consulta.
alter table svas.parametros_comerciales enable row level security;
alter table svas.aseguradora            enable row level security;
alter table svas.plan                   enable row level security;
alter table svas.campo_requerido        enable row level security;
alter table svas.valor_permitido        enable row level security;
alter table svas.regla_inspeccion       enable row level security;

-- descuento_maximo no es para el CLIENTE (§7): solo ASESOR y ADMINISTRADOR.
-- Los flujos públicos los lee el backend con service_role.
create policy parametros_select on svas.parametros_comerciales
  for select to authenticated
  using ((select svas.rol_actual()) in ('ASESOR', 'ADMINISTRADOR'));

create policy aseguradora_select on svas.aseguradora
  for select to authenticated
  using (activa or (select svas.rol_actual()) = 'ADMINISTRADOR');

create policy plan_select on svas.plan
  for select to authenticated
  using (activo or (select svas.rol_actual()) = 'ADMINISTRADOR');

create policy campo_select on svas.campo_requerido
  for select to authenticated
  using (activo or (select svas.rol_actual()) = 'ADMINISTRADOR');

-- El valor se ve si su campo se ve (la RLS de campo_requerido aplica en el exists).
create policy valor_select on svas.valor_permitido
  for select to authenticated
  using (exists (select 1 from svas.campo_requerido c where c.id = campo_requerido_id));

create policy regla_select on svas.regla_inspeccion
  for select to authenticated
  using (true);

-- ── Permisos ────────────────────────────────────────────────────────────────
revoke all on svas.parametros_comerciales, svas.aseguradora, svas.plan,
              svas.campo_requerido, svas.valor_permitido, svas.regla_inspeccion
  from public, anon, authenticated;

grant select on svas.parametros_comerciales, svas.aseguradora, svas.plan,
                svas.campo_requerido, svas.valor_permitido, svas.regla_inspeccion
  to authenticated, service_role;

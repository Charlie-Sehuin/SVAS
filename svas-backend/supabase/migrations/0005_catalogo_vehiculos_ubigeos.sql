-- 0005 · Catálogo de vehículos y ubicación (D7): marca, tipo_vehiculo, modelo, ubigeo + RLS
-- Fuente: contexto §4.1 (D7), §7 (RLS: lectura para authenticated).
-- Compartido por las 5 aseguradoras. Escritura: solo seed (0017) o RPC admin.

create table svas.marca (
  id     uuid primary key default gen_random_uuid(),
  nombre varchar(40) not null,
  activa boolean     not null default true,
  constraint uq_marca_nombre unique (nombre)
);

create table svas.tipo_vehiculo (
  id     uuid primary key default gen_random_uuid(),
  nombre varchar(30) not null,
  constraint uq_tipo_vehiculo_nombre unique (nombre)
);

-- El tipo pertenece al modelo (un Corolla siempre es Sedán): el cliente no lo escribe.
create table svas.modelo (
  id       uuid primary key default gen_random_uuid(),
  marca_id uuid        not null references svas.marca (id) on delete restrict,
  tipo_id  uuid        not null references svas.tipo_vehiculo (id) on delete restrict,
  nombre   varchar(50) not null,
  activo   boolean     not null default true,
  constraint uq_modelo_marca_nombre unique (marca_id, nombre)
);

create index ix_modelo_tipo on svas.modelo (tipo_id);

-- Código INEI: 2 dígitos de departamento + 2 de provincia + 2 de distrito.
create table svas.ubigeo (
  codigo       char(6)     primary key,
  departamento varchar(40) not null,
  provincia    varchar(40) not null,
  distrito     varchar(60) not null,
  constraint ck_ubigeo_codigo check (codigo ~ '^[0-9]{6}$')
);

create index ix_ubigeo_departamento_provincia on svas.ubigeo (departamento, provincia);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table svas.marca         enable row level security;
alter table svas.tipo_vehiculo enable row level security;
alter table svas.modelo        enable row level security;
alter table svas.ubigeo        enable row level security;

create policy marca_select on svas.marca
  for select to authenticated
  using (activa or (select svas.rol_actual()) = 'ADMINISTRADOR');

create policy tipo_vehiculo_select on svas.tipo_vehiculo
  for select to authenticated
  using (true);

create policy modelo_select on svas.modelo
  for select to authenticated
  using (activo or (select svas.rol_actual()) = 'ADMINISTRADOR');

create policy ubigeo_select on svas.ubigeo
  for select to authenticated
  using (true);

revoke all on svas.marca, svas.tipo_vehiculo, svas.modelo, svas.ubigeo
  from public, anon, authenticated;

grant select on svas.marca, svas.tipo_vehiculo, svas.modelo, svas.ubigeo
  to authenticated, service_role;

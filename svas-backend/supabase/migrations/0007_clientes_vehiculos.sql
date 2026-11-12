-- 0007 · Clientes y vehículos (D2): cliente, vehiculo (con modelo_id),
--        ubicacion_uso (con ubigeo) + RLS
-- Fuente: contexto §4.1 (D2), §7 (RLS y campos sensibles).
--
-- Escritura: solo vía RPC (0012: registrar_cotizacion, vincular_cliente).
-- authenticated solo lee lo suyo; el ASESOR se suma en 0009 (casos de su cola).
--
-- Los checks de documento/email/teléfono de la Práctica 2 no están en docs/;
-- se proponen: DNI de 8 dígitos o CE/pasaporte de 9 a 12 alfanuméricos,
-- celular peruano de 9 dígitos que empieza con 9 (igual que RegistroDto).

-- ── cliente ─────────────────────────────────────────────────────────────────
create table svas.cliente (
  id               uuid primary key default gen_random_uuid(),
  usuario_id       uuid null references svas.usuario (id) on delete restrict, -- null = cotizó sin cuenta
  nombres          varchar(80)  not null,
  apellidos        varchar(80)  not null,
  numero_documento varchar(12)  null,                                         -- se pide en CU-02
  telefono         varchar(9)   not null,
  email            varchar(254) not null,
  canal_preferido  svas.canal_contacto not null default 'WHATSAPP',
  creado_en        timestamptz  not null default now(),
  constraint uq_cliente_usuario   unique (usuario_id),
  constraint uq_cliente_documento unique (numero_documento),
  constraint ck_cliente_nombres   check (btrim(nombres) <> '' and btrim(apellidos) <> ''),
  constraint ck_cliente_documento check (numero_documento ~ '^([0-9]{8}|[0-9A-Z]{9,12})$'),
  constraint ck_cliente_telefono  check (telefono ~ '^9[0-9]{8}$'),
  constraint ck_cliente_email     check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

-- Búsqueda de un cliente sin cuenta por email + teléfono (RPC 6.1).
create index ix_cliente_email_telefono on svas.cliente (lower(email), telefono);

comment on table svas.cliente is
  'Persona que cotiza. Sin cuenta (usuario_id null) hasta que se registra o inicia sesión.';

-- ── vehiculo ────────────────────────────────────────────────────────────────
create table svas.vehiculo (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid              not null references svas.cliente (id) on delete restrict,
  uso        svas.uso_vehiculo not null,
  modelo_id  uuid              not null references svas.modelo (id) on delete restrict, -- la marca sale del modelo
  anio       smallint          not null,
  clase      varchar(30)       null,
  tipo       varchar(30)       null,       -- instantánea de tipo_vehiculo.nombre al registrar
  placa      varchar(7)        null,       -- se pide en CU-02
  creado_en  timestamptz       not null default now(),
  constraint ck_vehiculo_anio  check (anio between 1950 and 2100),
  constraint ck_vehiculo_placa check (placa ~ '^[A-Z0-9]{3}-?[0-9]{3}$')
);

create index ix_vehiculo_cliente on svas.vehiculo (cliente_id);
create index ix_vehiculo_modelo  on svas.vehiculo (modelo_id);

-- ── ubicacion_uso (composición 1:1 con vehículo) ────────────────────────────
create table svas.ubicacion_uso (
  id          uuid primary key default gen_random_uuid(),
  vehiculo_id uuid    not null references svas.vehiculo (id) on delete cascade,
  ubigeo      char(6) not null references svas.ubigeo (codigo) on delete restrict,
  constraint uq_ubicacion_vehiculo unique (vehiculo_id)
);

create index ix_ubicacion_ubigeo on svas.ubicacion_uso (ubigeo);

-- ── Helper de visibilidad ───────────────────────────────────────────────────
-- SECURITY DEFINER para no encadenar RLS entre tablas. 0009 lo reemplaza para
-- sumar al ASESOR (cliente con solicitud de asesoría).
create or replace function svas.puede_ver_cliente(p_cliente_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = svas, public
as $$
begin
  if svas.rol_actual() = 'ADMINISTRADOR' then
    return true;
  end if;
  return exists (
    select 1 from svas.cliente c
     where c.id = p_cliente_id
       and c.usuario_id = auth.uid()
  );
end;
$$;

revoke execute on function svas.puede_ver_cliente(uuid) from public, anon;
grant execute on function svas.puede_ver_cliente(uuid) to authenticated, service_role;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table svas.cliente       enable row level security;
alter table svas.vehiculo      enable row level security;
alter table svas.ubicacion_uso enable row level security;

create policy cliente_select on svas.cliente
  for select to authenticated
  using (svas.puede_ver_cliente(id));

create policy vehiculo_select on svas.vehiculo
  for select to authenticated
  using (svas.puede_ver_cliente(cliente_id));

-- La ubicación se ve si su vehículo se ve (la RLS de vehiculo aplica en el exists).
create policy ubicacion_select on svas.ubicacion_uso
  for select to authenticated
  using (exists (select 1 from svas.vehiculo v where v.id = vehiculo_id));

-- ── Permisos ────────────────────────────────────────────────────────────────
-- Sin INSERT/UPDATE/DELETE para authenticated: la escritura va por RPC.
revoke all on svas.cliente, svas.vehiculo, svas.ubicacion_uso
  from public, anon, authenticated;

grant select on svas.cliente, svas.vehiculo, svas.ubicacion_uso
  to authenticated, service_role;

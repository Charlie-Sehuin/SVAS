-- 0008 · Cotizaciones (D3): cotizacion (con token_acceso_hash), cotizacion_opcion,
--        prima_cotizada (suma, prima anual, prima mensual, desglose) + RLS
-- Fuente: contexto §4.1 (D3), §4.3 (índices), §5 (RN-37..41), §7 (RLS y campos sensibles).
--
-- Escritura: solo vía RPC (0012). authenticated solo lee lo suyo; el ASESOR
-- se suma en 0009. Columnas que authenticated NUNCA lee (grant por columna):
--   cotizacion.token_acceso_hash   (credencial del flujo anónimo)
--   prima_cotizada.detalle_calculo (desglose = secreto comercial, RN-41; el
--                                   ASESOR/ADMIN lo reciben vía backend)

-- ── cotizacion ──────────────────────────────────────────────────────────────
create table svas.cotizacion (
  id                uuid primary key default gen_random_uuid(),
  vehiculo_id       uuid                   not null references svas.vehiculo (id) on delete restrict,
  fecha             timestamptz            not null default now(),
  estado            svas.estado_cotizacion not null default 'REGISTRADA',
  motivo_derivacion svas.motivo_asesoria   null,
  token_acceso_hash varchar(64)            not null,  -- sha256 hex del tokenAcceso; el token en claro nunca se guarda
  constraint uq_cotizacion_token     unique (token_acceso_hash),
  constraint ck_cotizacion_token     check (token_acceso_hash ~ '^[0-9a-f]{64}$'),
  -- Solo la derivación del sistema (RN-03/RN-04) deja motivo al cotizar.
  constraint ck_cotizacion_derivacion check (
    motivo_derivacion is null or motivo_derivacion in ('INSPECCION', 'NO_ASEGURABLE')
  )
);

create index ix_cotizacion_vehiculo on svas.cotizacion (vehiculo_id);
-- Detector de abandono (6.10).
create index ix_cotizacion_registrada on svas.cotizacion (estado, fecha)
  where estado = 'REGISTRADA';

-- ── cotizacion_opcion (composición) ─────────────────────────────────────────
create table svas.cotizacion_opcion (
  id            uuid primary key default gen_random_uuid(),
  cotizacion_id uuid              not null references svas.cotizacion (id) on delete cascade,
  opcion        svas.opcion_venta not null,
  constraint uq_opcion_por_cotizacion unique (cotizacion_id, opcion)
);

-- ── prima_cotizada (composición) ────────────────────────────────────────────
create table svas.prima_cotizada (
  id                   uuid primary key default gen_random_uuid(),
  cotizacion_id        uuid          not null references svas.cotizacion (id) on delete cascade,
  plan_id              uuid          not null references svas.plan (id) on delete restrict,
  suma_asegurada       numeric(12,2) null,   -- elegida por el cliente, dentro del rango (RN-37)
  prima                numeric(12,2) null,   -- prima ANUAL al contado
  prima_mensual        numeric(12,2) null,   -- cuota si paga en 12 meses (RN-38)
  detalle_calculo      jsonb         null,   -- instantánea del cálculo (RN-41)
  motivo_no_disponible varchar(20)   null,   -- RN-39
  disponible           boolean       not null,
  constraint uq_prima_cotizacion_plan unique (cotizacion_id, plan_id),
  constraint uq_prima_id_cotizacion   unique (id, cotizacion_id),  -- soporte de la FK compuesta de orden_compra
  constraint ck_prima_motivo check (
    motivo_no_disponible in ('SIN_RANGO', 'PESO_FALTANTE', 'ERROR_ESTRATEGIA')
  ),
  constraint ck_prima_disponible check (
    (disponible
       and suma_asegurada > 0 and prima > 0 and prima_mensual > 0
       and motivo_no_disponible is null)
    or
    (not disponible
       and suma_asegurada is null and prima is null and prima_mensual is null
       and motivo_no_disponible is not null)
  )
);

create index ix_prima_plan on svas.prima_cotizada (plan_id);

-- ── Helpers de autorización ─────────────────────────────────────────────────
-- Dueño = el cliente de la cotización está vinculado a auth.uid().
-- Lo usan las policies y los RPC de compra (backend §4.3).
create or replace function svas.es_duenio_cotizacion(p_cotizacion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = svas, public
as $$
  select exists (
    select 1
      from svas.cotizacion co
      join svas.vehiculo v on v.id = co.vehiculo_id
      join svas.cliente  c on c.id = v.cliente_id
     where co.id = p_cotizacion_id
       and c.usuario_id = auth.uid()
  );
$$;

-- 0009 lo reemplaza para sumar al ASESOR (cotización con solicitud).
create or replace function svas.puede_ver_cotizacion(p_cotizacion_id uuid)
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
  return svas.es_duenio_cotizacion(p_cotizacion_id);
end;
$$;

revoke execute on function svas.es_duenio_cotizacion(uuid) from public, anon;
revoke execute on function svas.puede_ver_cotizacion(uuid) from public, anon;
grant execute on function svas.es_duenio_cotizacion(uuid) to authenticated, service_role;
grant execute on function svas.puede_ver_cotizacion(uuid) to authenticated, service_role;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table svas.cotizacion        enable row level security;
alter table svas.cotizacion_opcion enable row level security;
alter table svas.prima_cotizada    enable row level security;

create policy cotizacion_select on svas.cotizacion
  for select to authenticated
  using (svas.puede_ver_cotizacion(id));

create policy cotizacion_opcion_select on svas.cotizacion_opcion
  for select to authenticated
  using (svas.puede_ver_cotizacion(cotizacion_id));

create policy prima_cotizada_select on svas.prima_cotizada
  for select to authenticated
  using (svas.puede_ver_cotizacion(cotizacion_id));

-- ── Permisos ────────────────────────────────────────────────────────────────
revoke all on svas.cotizacion, svas.cotizacion_opcion, svas.prima_cotizada
  from public, anon, authenticated;

grant select (id, vehiculo_id, fecha, estado, motivo_derivacion)
  on svas.cotizacion to authenticated;
grant select on svas.cotizacion_opcion to authenticated;
grant select (id, cotizacion_id, plan_id, suma_asegurada, prima, prima_mensual,
              motivo_no_disponible, disponible)
  on svas.prima_cotizada to authenticated;

grant select on svas.cotizacion, svas.cotizacion_opcion, svas.prima_cotizada
  to service_role;

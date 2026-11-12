-- 0009 · solicitud_asesoria completa + T1 + RLS
-- Fuente: contexto §4.1 (D6), §4.3 (cola), §5 (RN-01..04, RN-13), §7, §13.2.
--
-- Se adelanta de la 0009 planeada en el doc porque registrar_cotizacion (0012)
-- la necesita para la derivación del sistema (motivo INSPECCION / NO_ASEGURABLE).
-- seguimiento, intento_contacto, descuento y T2 van en una migración posterior
-- (las de número bajo ya no se pueden reordenar: ver estado-implementacion §4).
--
-- T1 (Práctica 2, no está en docs/): se interpreta como "asesor_id apunta a un
-- usuario con rol ASESOR y activo". La función es genérica para reutilizarla en
-- intento_contacto y descuento.

-- ── solicitud_asesoria ──────────────────────────────────────────────────────
create table svas.solicitud_asesoria (
  id             uuid primary key default gen_random_uuid(),
  cotizacion_id  uuid                  not null references svas.cotizacion (id) on delete restrict,
  asesor_id      uuid                  null references svas.usuario (id) on delete restrict,
  motivo         svas.motivo_asesoria  not null,
  estado         svas.estado_solicitud not null default 'PENDIENTE',
  canal          svas.canal_contacto   not null,
  origen         svas.origen_caso      not null,
  fecha_creacion timestamptz           not null default now(),
  resultado      varchar(200)          null,
  -- asesor obligatorio salvo en PENDIENTE (6.5 lo asigna al tomar el caso).
  constraint ck_solicitud_asesor check (estado = 'PENDIENTE' or asesor_id is not null),
  -- SISTEMA ⇔ INSPECCION / NO_ASEGURABLE (RN-03, RN-04).
  constraint ck_solicitud_origen check (
    (origen = 'SISTEMA') = (motivo in ('INSPECCION', 'NO_ASEGURABLE'))
  ),
  constraint ck_solicitud_resultado check (
    estado <> 'CERRADA' or (resultado is not null and btrim(resultado) <> '')
  )
);

-- Una sola solicitud abierta por cotización (evita duplicados del sistema y del cliente).
create unique index uq_solicitud_abierta_por_cotizacion
  on svas.solicitud_asesoria (cotizacion_id)
  where estado <> 'CERRADA';

create index ix_solicitud_cotizacion on svas.solicitud_asesoria (cotizacion_id);
create index ix_solicitud_asesor     on svas.solicitud_asesoria (asesor_id);
-- Cola de asesoría (RN-13): primero SISTEMA, luego CLIENTE, por antigüedad.
create index ix_solicitud_cola on svas.solicitud_asesoria (estado, origen, fecha_creacion)
  where estado <> 'CERRADA';

-- ── T1: el asesor asignado debe ser un ASESOR activo ────────────────────────
create or replace function svas.fn_validar_asesor()
returns trigger
language plpgsql
security definer
set search_path = svas, public
as $$
begin
  if new.asesor_id is not null and not exists (
    select 1 from svas.usuario u
     where u.id = new.asesor_id
       and u.rol = 'ASESOR'
       and u.activo
  ) then
    raise exception 'El usuario asignado no es un asesor activo';
  end if;
  return new;
end;
$$;

revoke execute on function svas.fn_validar_asesor() from public, anon, authenticated;

create trigger tg_solicitud_asesor_valido
before insert or update of asesor_id on svas.solicitud_asesoria
for each row execute function svas.fn_validar_asesor();

-- ── Visibilidad: el ASESOR ve la cotización y el cliente de su cola ─────────
-- Reemplaza los helpers de 0007 y 0008 (contexto §7: "ASESOR y existe
-- solicitud/seguimiento de esa cotización"; seguimiento se suma cuando exista).
create or replace function svas.puede_ver_cotizacion(p_cotizacion_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = svas, public
as $$
declare
  v_rol svas.rol := svas.rol_actual();
begin
  if v_rol = 'ADMINISTRADOR' then
    return true;
  end if;
  if v_rol = 'ASESOR' then
    return exists (select 1 from svas.solicitud_asesoria s where s.cotizacion_id = p_cotizacion_id);
  end if;
  return svas.es_duenio_cotizacion(p_cotizacion_id);
end;
$$;

create or replace function svas.puede_ver_cliente(p_cliente_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = svas, public
as $$
declare
  v_rol svas.rol := svas.rol_actual();
begin
  if v_rol = 'ADMINISTRADOR' then
    return true;
  end if;
  if v_rol = 'ASESOR' then
    return exists (
      select 1
        from svas.vehiculo v
        join svas.cotizacion co         on co.vehiculo_id = v.id
        join svas.solicitud_asesoria s  on s.cotizacion_id = co.id
       where v.cliente_id = p_cliente_id
    );
  end if;
  return exists (
    select 1 from svas.cliente c
     where c.id = p_cliente_id
       and c.usuario_id = auth.uid()
  );
end;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table svas.solicitud_asesoria enable row level security;

-- ASESOR y ADMINISTRADOR ven la cola; el cliente, el estado de sus solicitudes.
create policy solicitud_select on svas.solicitud_asesoria
  for select to authenticated
  using (
    (select svas.rol_actual()) in ('ASESOR', 'ADMINISTRADOR')
    or svas.es_duenio_cotizacion(cotizacion_id)
  );

revoke all on svas.solicitud_asesoria from public, anon, authenticated;
grant select on svas.solicitud_asesoria to authenticated, service_role;

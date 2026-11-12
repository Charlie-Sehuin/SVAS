-- 0024 · Asesoría y retención (D6): seguimiento, intento_contacto, descuento
--        + T1 (asesor válido) + T2 (tope de descuento) + RLS
-- Fuente: contexto §4.1 (D6), §4.3 (cola de seguimiento), §5 (RN-07, RN-09..12), §7, §13.3.
--
-- El doc las ubica en 0009 junto a solicitud_asesoria; 0009 ya se aplicó solo
-- con solicitud_asesoria (adelantada para la derivación), por eso van aquí.
--
-- Ajuste propio: seguimiento.enlace_usado_en (6.11 "un solo uso") y el enlace
-- también puede existir EN_SEGUIMIENTO (POST /seguimientos/:id/aceptacion
-- reenvía el enlace de compra sin cerrar el caso).

-- ── seguimiento ─────────────────────────────────────────────────────────────
create table svas.seguimiento (
  id               uuid primary key default gen_random_uuid(),
  cotizacion_id    uuid                    not null references svas.cotizacion (id) on delete restrict,
  estado           svas.estado_seguimiento not null default 'EN_SEGUIMIENTO',
  intentos         smallint                not null default 0,
  fecha_apertura   timestamptz             not null default now(),
  fecha_cierre     timestamptz             null,
  motivo_cierre    svas.motivo_cierre      null,
  enlace_token     varchar(64)             null,   -- sha256 hex del token de retoma (nunca el token)
  enlace_expira_en timestamptz             null,
  enlace_usado_en  timestamptz             null,
  constraint uq_seguimiento_cotizacion unique (cotizacion_id),
  constraint uq_seguimiento_enlace     unique (enlace_token),
  constraint ck_seguimiento_intentos   check (intentos >= 0),
  -- RN-11: abierto sin cierre; DESCARTADO exige motivo; CONVERTIDO sin motivo.
  constraint ck_seguimiento_cierre check (
    (estado = 'EN_SEGUIMIENTO' and fecha_cierre is null and motivo_cierre is null)
    or (estado = 'DESCARTADO' and fecha_cierre is not null and motivo_cierre is not null)
    or (estado = 'CONVERTIDO' and fecha_cierre is not null and motivo_cierre is null)
  ),
  constraint ck_seguimiento_enlace check (
    (enlace_token is null) = (enlace_expira_en is null)
    and (enlace_token is null or enlace_token ~ '^[0-9a-f]{64}$')
    and (enlace_usado_en is null or enlace_token is not null)
  ),
  constraint ck_seguimiento_fechas check (
    (fecha_cierre is null or fecha_cierre >= fecha_apertura)
    and (enlace_expira_en is null or enlace_expira_en > fecha_apertura)
  )
);

-- Cola de seguimiento.
create index ix_seguimiento_cola on svas.seguimiento (estado, fecha_apertura)
  where estado = 'EN_SEGUIMIENTO';

-- ── intento_contacto ────────────────────────────────────────────────────────
create table svas.intento_contacto (
  id             uuid primary key default gen_random_uuid(),
  seguimiento_id uuid                   not null references svas.seguimiento (id) on delete cascade,
  asesor_id      uuid                   not null references svas.usuario (id) on delete restrict,
  canal          svas.canal_contacto    not null,
  fecha          timestamptz            not null default now(),
  resultado      svas.resultado_intento not null
);

create index ix_intento_seguimiento on svas.intento_contacto (seguimiento_id);
create index ix_intento_asesor      on svas.intento_contacto (asesor_id);

create trigger tg_intento_asesor_valido
before insert or update of asesor_id on svas.intento_contacto
for each row execute function svas.fn_validar_asesor();   -- T1 (0009)

-- ── descuento ───────────────────────────────────────────────────────────────
create table svas.descuento (
  id            uuid primary key default gen_random_uuid(),
  cotizacion_id uuid                not null references svas.cotizacion (id) on delete restrict,
  plan_id       uuid                not null references svas.plan (id) on delete restrict,
  asesor_id     uuid                null references svas.usuario (id) on delete restrict,
  tipo          svas.tipo_descuento not null,
  porcentaje    numeric(5,2)        not null,
  fecha         timestamptz         not null default now(),
  aceptado      boolean             not null default false,
  constraint ck_descuento_porcentaje check (porcentaje > 0 and porcentaje <= 100),
  -- El negociado lo registra un asesor; el de primera compra, el sistema.
  constraint ck_descuento_asesor check ((tipo = 'NEGOCIADO') = (asesor_id is not null))
);

-- RN-09: un solo descuento aceptado por cotización.
create unique index uq_descuento_aceptado on svas.descuento (cotizacion_id) where aceptado;
create index ix_descuento_cotizacion on svas.descuento (cotizacion_id);
create index ix_descuento_plan       on svas.descuento (plan_id);
create index ix_descuento_asesor     on svas.descuento (asesor_id);

create trigger tg_descuento_asesor_valido
before insert or update of asesor_id on svas.descuento
for each row execute function svas.fn_validar_asesor();   -- T1

-- ── T2: ningún descuento supera el tope vigente (RN-07) ─────────────────────
create or replace function svas.fn_validar_tope_descuento()
returns trigger
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_tope numeric;
begin
  select descuento_maximo into v_tope from svas.parametros_comerciales where id = 1;
  if new.porcentaje > v_tope then
    raise exception 'El descuento no puede superar el % %%', to_char(v_tope, 'FM990.00');
  end if;
  return new;
end;
$$;

revoke execute on function svas.fn_validar_tope_descuento() from public, anon, authenticated;

create trigger tg_descuento_tope
before insert or update of porcentaje on svas.descuento
for each row execute function svas.fn_validar_tope_descuento();

-- ── Visibilidad: el ASESOR también ve los casos en seguimiento ──────────────
-- Reemplaza los helpers de 0009 (contexto §7: "solicitud/seguimiento").
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
    return exists (select 1 from svas.solicitud_asesoria s where s.cotizacion_id = p_cotizacion_id)
        or exists (select 1 from svas.seguimiento sg where sg.cotizacion_id = p_cotizacion_id);
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
        join svas.cotizacion co on co.vehiculo_id = v.id
       where v.cliente_id = p_cliente_id
         and (exists (select 1 from svas.solicitud_asesoria s where s.cotizacion_id = co.id)
              or exists (select 1 from svas.seguimiento sg where sg.cotizacion_id = co.id))
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
alter table svas.seguimiento      enable row level security;
alter table svas.intento_contacto enable row level security;
alter table svas.descuento        enable row level security;

create policy seguimiento_select on svas.seguimiento
  for select to authenticated
  using ((select svas.rol_actual()) in ('ASESOR', 'ADMINISTRADOR'));

create policy intento_select on svas.intento_contacto
  for select to authenticated
  using ((select svas.rol_actual()) in ('ASESOR', 'ADMINISTRADOR'));

-- El cliente ve sus descuentos (prima negociada para completar la compra, §13.2).
create policy descuento_select on svas.descuento
  for select to authenticated
  using (
    (select svas.rol_actual()) in ('ASESOR', 'ADMINISTRADOR')
    or svas.es_duenio_cotizacion(cotizacion_id)
  );

-- ── Permisos ────────────────────────────────────────────────────────────────
-- Escritura solo vía RPC (0025). enlace_token (hash) nunca se lee desde authenticated.
revoke all on svas.seguimiento, svas.intento_contacto, svas.descuento
  from public, anon, authenticated;

grant select (id, cotizacion_id, estado, intentos, fecha_apertura, fecha_cierre,
              motivo_cierre, enlace_expira_en, enlace_usado_en)
  on svas.seguimiento to authenticated;
grant select on svas.intento_contacto, svas.descuento to authenticated;

grant select on svas.seguimiento, svas.intento_contacto, svas.descuento to service_role;

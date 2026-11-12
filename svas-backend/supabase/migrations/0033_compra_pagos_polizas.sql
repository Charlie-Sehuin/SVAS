-- 0033 · Compra, pagos y pólizas (D4 y D5): orden_compra, pago, cuota, poliza
--        + T3 (cuotas y monto) + T4 (póliza solo con pago confirmado) + RLS
-- Fuente: contexto §4.1 (D4/D5), §5 (RN-08, RN-14, RN-15, RN-27, RN-38, RN-45),
--         §7 (RLS: dueño y ADMINISTRADOR); backend §4.3. El doc la ubica en 0010.
--
-- Escritura: solo vía RPC (0034). authenticated lee lo suyo; el ASESOR no ve
-- órdenes, pagos ni pólizas (contexto §3.9).
--
-- Ajustes propios (revisables):
--   · orden_compra guarda prima_anual y el descuento aplicado (tipo y %), para
--     que el resumen y el PDF no dependan de tablas que siguen cambiando.
--   · poliza.pdf_generado_en: null mientras el PDF no está en Storage; lo usa el
--     job que regenera los pendientes (tanda 2).
--   · En CUOTAS la cuota 1 se cobra al comprar (CONFIRMADO); las demás quedan
--     PENDIENTE con vencimiento mensual.

-- ── orden_compra ────────────────────────────────────────────────────────────
create table svas.orden_compra (
  id                   uuid primary key default gen_random_uuid(),
  cotizacion_id        uuid                not null references svas.cotizacion (id) on delete restrict,
  prima_cotizada_id    uuid                not null,
  prima_anual          numeric(12,2)       not null,   -- prima anual de la prima elegida al crear la orden
  descuento_id         uuid                null references svas.descuento (id) on delete restrict,
  descuento_tipo       svas.tipo_descuento null,
  descuento_porcentaje numeric(5,2)        null,
  prima_final          numeric(12,2)       not null,   -- prima_anual × (1 − descuento), RN-08/RN-09
  acepta_condiciones   boolean             not null,
  firma_simulada       varchar(120)        not null,   -- RF-24: nombre escrito por el cliente
  canal_venta          svas.canal_venta    not null,   -- RN-27
  contenido_plan       jsonb               not null,   -- copia congelada del plan (RN-45, §18.8)
  fecha                timestamptz         not null default now(),
  constraint uq_orden_cotizacion unique (cotizacion_id),
  constraint uq_orden_prima      unique (prima_cotizada_id),
  constraint uq_orden_id_canal   unique (id, canal_venta),   -- soporte de la FK compuesta de poliza
  constraint fk_orden_prima_misma_cotizacion
    foreign key (prima_cotizada_id, cotizacion_id)
    references svas.prima_cotizada (id, cotizacion_id) on delete restrict,
  constraint ck_orden_condiciones check (acepta_condiciones),
  constraint ck_orden_firma       check (btrim(firma_simulada) <> ''),
  constraint ck_orden_contenido   check (jsonb_typeof(contenido_plan) = 'object'),
  constraint ck_orden_descuento   check (
    (descuento_id is null and descuento_tipo is null and descuento_porcentaje is null)
    or (descuento_id is not null and descuento_tipo is not null
        and descuento_porcentaje > 0 and descuento_porcentaje <= 100)
  ),
  constraint ck_orden_prima check (
    prima_anual > 0
    and prima_final = round(prima_anual * (1 - coalesce(descuento_porcentaje, 0) / 100), 2)
  )
);

create index ix_orden_descuento on svas.orden_compra (descuento_id);
create index ix_orden_canal     on svas.orden_compra (canal_venta, fecha);

-- ── pago ────────────────────────────────────────────────────────────────────
create table svas.pago (
  id              uuid primary key default gen_random_uuid(),
  orden_compra_id uuid             not null references svas.orden_compra (id) on delete cascade,
  monto           numeric(12,2)    not null,   -- total a pagar (en CUOTAS incluye el recargo, RN-38)
  modo            svas.modo_pago   not null,
  estado          svas.estado_pago not null,
  numero_cuotas   smallint         null,
  referencia      varchar(60)      not null,   -- la da la pasarela
  fecha           timestamptz      not null default now(),
  constraint uq_pago_referencia unique (referencia),
  constraint ck_pago_monto      check (monto > 0),
  constraint ck_pago_referencia check (btrim(referencia) <> ''),
  constraint ck_pago_cuotas     check (
    (modo = 'UNICO' and numero_cuotas is null)
    or (modo = 'CUOTAS' and numero_cuotas between 2 and 24)
  )
);

-- Sin doble cobro: un solo pago confirmado por orden (RNF-05).
create unique index uq_pago_confirmado_por_orden on svas.pago (orden_compra_id)
  where estado = 'CONFIRMADO';
create index ix_pago_orden        on svas.pago (orden_compra_id);
create index ix_pago_estado_fecha on svas.pago (estado, fecha);

-- ── T3: cuotas y monto contra la orden (RN-14, RN-38) ───────────────────────
create or replace function svas.fn_validar_pago()
returns trigger
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_prima_final numeric;
  v_max         smallint;
begin
  select prima_final into v_prima_final from svas.orden_compra where id = new.orden_compra_id;
  select max_cuotas into v_max from svas.parametros_comerciales where id = 1;

  if new.modo = 'CUOTAS' and new.numero_cuotas > v_max then
    raise exception 'Puedes pagar hasta en % cuotas', v_max;
  end if;
  if new.modo = 'UNICO' and new.monto <> v_prima_final then
    raise exception 'El pago al contado debe ser igual a la prima final';
  end if;
  if new.monto < v_prima_final then
    raise exception 'El monto del pago no puede ser menor que la prima final';
  end if;
  return new;
end;
$$;

revoke execute on function svas.fn_validar_pago() from public, anon, authenticated;

create trigger tg_pago_valido
before insert or update of monto, modo, numero_cuotas on svas.pago
for each row execute function svas.fn_validar_pago();

-- ── cuota ───────────────────────────────────────────────────────────────────
create table svas.cuota (
  id                uuid primary key default gen_random_uuid(),
  pago_id           uuid             not null references svas.pago (id) on delete cascade,
  numero            smallint         not null,
  monto             numeric(12,2)    not null,
  fecha_vencimiento date             not null,
  estado            svas.estado_pago not null default 'PENDIENTE',
  constraint uq_cuota_por_pago unique (pago_id, numero),
  constraint ck_cuota_numero   check (numero between 1 and 24),
  constraint ck_cuota_monto    check (monto > 0)
);

-- ── poliza ──────────────────────────────────────────────────────────────────
create table svas.poliza (
  id              uuid primary key default gen_random_uuid(),
  orden_compra_id uuid             not null,
  canal_venta     svas.canal_venta not null,
  numero          varchar(30)      not null,
  fecha_emision   timestamptz      not null default now(),
  archivo_pdf     varchar(300)     not null,
  pdf_generado_en timestamptz      null,
  constraint uq_poliza_orden  unique (orden_compra_id),
  constraint uq_poliza_numero unique (numero),
  constraint fk_poliza_orden_canal
    foreign key (orden_compra_id, canal_venta)
    references svas.orden_compra (id, canal_venta) on delete restrict,
  constraint ck_poliza_numero  check (btrim(numero) <> ''),
  constraint ck_poliza_archivo check (archivo_pdf = 'polizas/' || id::text || '.pdf')
);

-- Job de regeneración del PDF (tanda 2).
create index ix_poliza_pdf_pendiente on svas.poliza (fecha_emision)
  where pdf_generado_en is null;
create index ix_poliza_emision on svas.poliza (fecha_emision, canal_venta);

-- ── T4: póliza solo con pago confirmado (RN-15) ─────────────────────────────
create or replace function svas.fn_validar_poliza_pagada()
returns trigger
language plpgsql
security definer
set search_path = svas, public
as $$
begin
  if not exists (select 1 from svas.pago p
                  where p.orden_compra_id = new.orden_compra_id
                    and p.estado = 'CONFIRMADO') then
    raise exception 'No se puede emitir la póliza sin un pago confirmado';
  end if;
  return new;
end;
$$;

revoke execute on function svas.fn_validar_poliza_pagada() from public, anon, authenticated;

create trigger tg_poliza_pagada
before insert or update of orden_compra_id on svas.poliza
for each row execute function svas.fn_validar_poliza_pagada();

-- ── Visibilidad: dueño de la cotización o ADMINISTRADOR ─────────────────────
create or replace function svas.puede_ver_orden(p_orden_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = svas, public
as $$
declare
  v_cotizacion uuid;
begin
  if svas.rol_actual() = 'ADMINISTRADOR' then
    return true;
  end if;
  select cotizacion_id into v_cotizacion from svas.orden_compra where id = p_orden_id;
  return v_cotizacion is not null and svas.es_duenio_cotizacion(v_cotizacion);
end;
$$;

revoke execute on function svas.puede_ver_orden(uuid) from public, anon;
grant execute on function svas.puede_ver_orden(uuid) to authenticated, service_role;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table svas.orden_compra enable row level security;
alter table svas.pago         enable row level security;
alter table svas.cuota        enable row level security;
alter table svas.poliza       enable row level security;

create policy orden_compra_select on svas.orden_compra
  for select to authenticated
  using (svas.puede_ver_orden(id));

create policy pago_select on svas.pago
  for select to authenticated
  using (svas.puede_ver_orden(orden_compra_id));

create policy cuota_select on svas.cuota
  for select to authenticated
  using (exists (select 1 from svas.pago p
                  where p.id = pago_id and svas.puede_ver_orden(p.orden_compra_id)));

create policy poliza_select on svas.poliza
  for select to authenticated
  using (svas.puede_ver_orden(orden_compra_id));

-- ── Permisos ────────────────────────────────────────────────────────────────
revoke all on svas.orden_compra, svas.pago, svas.cuota, svas.poliza
  from public, anon, authenticated;

grant select on svas.orden_compra, svas.pago, svas.cuota, svas.poliza to authenticated;
-- service_role: jobs (regenerar PDF) y reportes. Escribe solo pdf_generado_en.
grant select on svas.orden_compra, svas.pago, svas.cuota, svas.poliza to service_role;
grant update (pdf_generado_en) on svas.poliza to service_role;

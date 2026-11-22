-- 0041 · Pagar las cuotas pendientes desde "Mi cuenta" (Fase B del panel del cliente)
--
-- Hasta ahora solo la cuota 1 se cobraba (al comprar); las demás quedaban PENDIENTE sin forma de pagarlas.
-- Esta migración:
--   · agrega a `cuota` cuándo se pagó (`pagada_en`), con qué referencia de la pasarela (`referencia`) y con qué
--     Idempotency-Key del cliente (`clave_idempotencia`);
--   · hace que `generar_cuotas` deje la cuota 1 con esos dos datos;
--   · crea el RPC `pagar_cuotas`: paga las SIGUIENTES N cuotas pendientes, siempre en orden (1 = la siguiente,
--     N = un grupo, todas = las que queden).
--
-- Decisiones (2026-11-22):
--   · Una cuota vencida no genera recargo ni bloqueo: solo se avisa (no hay estado "vencida" en la base; se
--     deduce de `fecha_vencimiento` y `estado = 'PENDIENTE'`).
--   · No se puede saltar el orden: nunca se paga la cuota 5 con la 3 pendiente.
--   · Sin doble cobro (RNF-05): si ya hay cuotas pagadas con la misma Idempotency-Key, el backend responde lo mismo
--     SIN cobrar en la pasarela, y el RPC (por si dos peticiones llegan a la vez) también devuelve lo mismo sin pagar otra vez.

-- ── Columnas nuevas ─────────────────────────────────────────────────────────
alter table svas.cuota
  add column pagada_en          timestamptz  null,
  add column referencia         varchar(60)  null,
  add column clave_idempotencia varchar(100) null;

comment on column svas.cuota.pagada_en is
  'Cuándo se pagó la cuota. Null mientras esté PENDIENTE.';
comment on column svas.cuota.referencia is
  'Referencia de la pasarela del cobro que la pagó. Varias cuotas pagadas juntas comparten referencia.';
comment on column svas.cuota.clave_idempotencia is
  'Idempotency-Key del pago desde Mi cuenta que la pagó (null en la cuota 1: se paga al comprar). Reintentar con la misma clave no cobra otra vez.';

-- Las cuotas 1 que ya existen se pagaron junto con el pago de la compra.
update svas.cuota c
   set pagada_en  = p.fecha,
       referencia = p.referencia
  from svas.pago p
 where p.id = c.pago_id
   and c.estado = 'CONFIRMADO'
   and c.pagada_en is null;

-- ── generar_cuotas: la cuota 1 nace pagada, con su fecha y referencia ───────
create or replace function svas.generar_cuotas(p_pago_id uuid)
returns void
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_pago  svas.pago;
  v_parte numeric;
  v_hoy   date := (now() at time zone 'America/Lima')::date;
begin
  select * into v_pago from svas.pago where id = p_pago_id;
  if not found or v_pago.modo <> 'CUOTAS' then
    return;
  end if;

  v_parte := round(v_pago.monto / v_pago.numero_cuotas, 2);

  insert into svas.cuota (pago_id, numero, monto, fecha_vencimiento, estado, pagada_en, referencia)
  select p_pago_id,
         n,
         case when n = v_pago.numero_cuotas
              then v_pago.monto - v_parte * (v_pago.numero_cuotas - 1)
              else v_parte end,
         (v_hoy + make_interval(months => n - 1))::date,
         case when n = 1 then 'CONFIRMADO'::svas.estado_pago else 'PENDIENTE'::svas.estado_pago end,
         case when n = 1 then now() end,
         case when n = 1 then v_pago.referencia end
    from generate_series(1, v_pago.numero_cuotas) n;
end;
$$;

-- ── pagar_cuotas ────────────────────────────────────────────────────────────
-- Rol: CLIENTE dueño de la compra (con su JWT). El backend ya cobró en la pasarela y pasa lo cobrado:
-- el RPC vuelve a comprobar que ese monto es exactamente la suma de las N cuotas que se van a marcar.
-- Devuelve el cronograma completo, para que la pantalla se actualice con una sola respuesta.
create or replace function svas.pagar_cuotas(
  p_orden_id   uuid,
  p_cantidad   smallint,
  p_referencia varchar,
  p_clave      varchar,
  p_monto      numeric
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_orden      svas.orden_compra;
  v_pago       svas.pago;
  v_pendientes integer;
  v_suma       numeric;
  v_repetido   boolean := false;
begin
  perform svas.exigir_rol(array['CLIENTE']);

  select * into v_orden from svas.orden_compra where id = p_orden_id;
  if not found then
    raise exception 'La compra no existe' using errcode = 'P0002';
  end if;
  if not svas.es_duenio_cotizacion(v_orden.cotizacion_id) then
    raise exception 'No tienes permiso para pagar esta compra' using errcode = '42501';
  end if;
  if coalesce(btrim(p_referencia), '') = '' or coalesce(btrim(p_clave), '') = '' then
    raise exception 'Falta la referencia del pago';
  end if;

  -- Bloquear el pago serializa los cobros de la misma compra (dos pestañas, doble clic).
  select * into v_pago
    from svas.pago
   where orden_compra_id = p_orden_id and estado = 'CONFIRMADO'
     for update;
  if not found then
    raise exception 'Esta compra aún no está pagada' using errcode = 'PT409';
  end if;
  if v_pago.modo <> 'CUOTAS' then
    raise exception 'Esta compra se pagó al contado: no tiene cuotas por pagar' using errcode = 'PT409';
  end if;

  if exists (select 1 from svas.cuota where pago_id = v_pago.id and clave_idempotencia = p_clave) then
    -- Reintento de un cobro que ya se aplicó: se responde lo mismo, sin pagar otra vez.
    v_repetido := true;
  else
    if p_cantidad is null or p_cantidad < 1 then
      raise exception 'Indica cuántas cuotas quieres pagar';
    end if;

    select count(*) into v_pendientes
      from svas.cuota where pago_id = v_pago.id and estado = 'PENDIENTE';
    if v_pendientes = 0 then
      raise exception 'Ya pagaste todas las cuotas' using errcode = 'PT409';
    end if;
    if p_cantidad > v_pendientes then
      raise exception 'Solo te quedan % cuotas por pagar', v_pendientes;
    end if;

    -- Siempre las primeras pendientes, en orden de número.
    select sum(s.monto) into v_suma
      from (select monto from svas.cuota
             where pago_id = v_pago.id and estado = 'PENDIENTE'
             order by numero limit p_cantidad) s;
    if p_monto is distinct from v_suma then
      raise exception 'El monto no coincide con las cuotas que vas a pagar';
    end if;

    update svas.cuota
       set estado = 'CONFIRMADO', pagada_en = now(), referencia = p_referencia, clave_idempotencia = p_clave
     where id in (select id from svas.cuota
                   where pago_id = v_pago.id and estado = 'PENDIENTE'
                   order by numero limit p_cantidad);

    insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(), 'PAGAR_CUOTAS', 'pago', v_pago.id,
            jsonb_build_object('orden_id', p_orden_id, 'cantidad', p_cantidad,
                               'monto', p_monto, 'referencia', p_referencia));
  end if;

  return jsonb_build_object(
    'repetido', v_repetido,
    'pago_id', v_pago.id,
    'referencia', coalesce((select c.referencia from svas.cuota c
                             where c.pago_id = v_pago.id and c.clave_idempotencia = p_clave limit 1), p_referencia),
    'monto_pagado', coalesce((select sum(c.monto) from svas.cuota c
                               where c.pago_id = v_pago.id and c.clave_idempotencia = p_clave), 0)::text,
    'cuotas_pagadas', coalesce((select jsonb_agg(c.numero order by c.numero) from svas.cuota c
                                 where c.pago_id = v_pago.id and c.clave_idempotencia = p_clave), '[]'::jsonb),
    'cuotas', coalesce((select jsonb_agg(jsonb_build_object(
                                 'numero', c.numero, 'monto', c.monto::text,
                                 'fecha_vencimiento', c.fecha_vencimiento, 'estado', c.estado)
                               order by c.numero)
                          from svas.cuota c where c.pago_id = v_pago.id), '[]'::jsonb));
end;
$$;

revoke all on function svas.pagar_cuotas(uuid, smallint, varchar, varchar, numeric) from public, anon;
grant execute on function svas.pagar_cuotas(uuid, smallint, varchar, varchar, numeric) to authenticated;

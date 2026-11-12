-- 0035 · RPCs de apoyo a la API de compra (Ola 3, tanda 3)
--   · completar_datos_compra: PUT /compras/:cotizacionId/datos guarda lo que
--     faltaba (documento y placa) antes de crear la orden (RNF-08).
--   · vista_previa_descuento: GET /compras/resumen muestra el descuento que
--     aplicará crear_orden_compra, con las mismas reglas (RN-06, RN-08, RN-09).
-- Fuente: doc conexión §6 "Compra"; contexto §5; 0034.
--
-- Errores: P0001 → 400 · P0002 → 404 · 42501 → 403 · PT409 → 409.
--
-- Ajustes propios (revisables):
--   · Un dato ya guardado no se cambia aquí: si llega distinto, error 400.
--   · Una vez creada la orden, los datos quedan fijos (409).
--   · La vista previa replica las reglas de crear_orden_compra (0034); si se
--     cambia una, hay que cambiar la otra.

-- ── PUT /compras/:cotizacionId/datos ────────────────────────────────────────
create or replace function svas.completar_datos_compra(
  p_cotizacion_id    uuid,
  p_numero_documento text,
  p_placa            text
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  d       record;
  v_doc   text := nullif(upper(btrim(p_numero_documento)), '');
  v_placa text := nullif(upper(btrim(p_placa)), '');
  v_antes jsonb;
begin
  perform svas.exigir_rol(array['CLIENTE']);

  select co.id, co.estado, v.id as vehiculo_id, v.placa, c.id as cliente_id, c.numero_documento
    into d
    from svas.cotizacion co
    join svas.vehiculo v on v.id = co.vehiculo_id
    join svas.cliente c  on c.id = v.cliente_id
   where co.id = p_cotizacion_id
     for update of co;

  if not found then
    raise exception 'La cotización no existe' using errcode = 'P0002';
  end if;
  if not svas.es_duenio_cotizacion(p_cotizacion_id) then
    raise exception 'No tienes permiso para modificar esta cotización' using errcode = '42501';
  end if;
  if d.estado = 'CONVERTIDA' then
    raise exception 'Esta cotización ya se convirtió en póliza' using errcode = 'PT409';
  end if;
  if exists (select 1 from svas.orden_compra where cotizacion_id = p_cotizacion_id) then
    raise exception 'Ya iniciaste tu compra: tus datos ya no se pueden cambiar' using errcode = 'PT409';
  end if;

  if v_doc is not null then
    if v_doc !~ '^([0-9]{8}|[0-9A-Z]{9,12})$' then
      raise exception 'El número de documento debe tener 8 dígitos (DNI) o de 9 a 12 caracteres';
    end if;
    if d.numero_documento is not null and d.numero_documento <> v_doc then
      raise exception 'Tu número de documento ya está registrado y no se puede cambiar';
    end if;
    if d.numero_documento is null
       and exists (select 1 from svas.cliente c where c.numero_documento = v_doc and c.id <> d.cliente_id) then
      raise exception 'Ese número de documento ya está registrado con otra cuenta' using errcode = 'PT409';
    end if;
  end if;

  if v_placa is not null then
    if v_placa !~ '^[A-Z0-9]{3}-?[0-9]{3}$' then
      raise exception 'La placa debe tener el formato ABC-123';
    end if;
    if d.placa is not null and replace(d.placa, '-', '') <> replace(v_placa, '-', '') then
      raise exception 'La placa de este vehículo ya está registrada y no se puede cambiar';
    end if;
  end if;

  v_antes := jsonb_build_object('numero_documento', d.numero_documento, 'placa', d.placa);

  if d.numero_documento is null and v_doc is not null then
    update svas.cliente set numero_documento = v_doc where id = d.cliente_id;
  end if;
  if d.placa is null and v_placa is not null then
    update svas.vehiculo set placa = v_placa where id = d.vehiculo_id;
  end if;

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  select auth.uid(), 'COMPLETAR_DATOS_COMPRA', 'cotizacion', p_cotizacion_id,
         jsonb_build_object('antes', v_antes,
                            'despues', jsonb_build_object('numero_documento', coalesce(d.numero_documento, v_doc),
                                                          'placa', coalesce(d.placa, v_placa)))
   where coalesce(d.numero_documento, v_doc) is distinct from d.numero_documento
      or coalesce(d.placa, v_placa) is distinct from d.placa;

  return jsonb_build_object('numero_documento', coalesce(d.numero_documento, v_doc),
                            'placa', coalesce(d.placa, v_placa));
end;
$$;

-- ── GET /compras/resumen: descuento que aplicaría la orden ─────────────────
-- Devuelve {tipo, porcentaje, provisional} o null. "provisional" = el cliente
-- aún no dio su documento, así que la primera compra se confirma al crear la orden.
create or replace function svas.vista_previa_descuento(
  p_cotizacion_id     uuid,
  p_prima_cotizada_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = svas, public
as $$
declare
  v_doc     text;
  v_plan    uuid;
  v_neg     svas.descuento;
  v_pc_pct  numeric;
  v_primera boolean;
begin
  perform svas.exigir_rol(array['CLIENTE']);
  if not svas.es_duenio_cotizacion(p_cotizacion_id) then
    raise exception 'No tienes permiso para ver esta cotización' using errcode = '42501';
  end if;

  select pc.plan_id into v_plan
    from svas.prima_cotizada pc
   where pc.id = p_prima_cotizada_id and pc.cotizacion_id = p_cotizacion_id;
  if not found then
    raise exception 'Ese plan no está en tu cotización' using errcode = 'P0002';
  end if;

  select c.numero_documento into v_doc
    from svas.cotizacion co
    join svas.vehiculo v on v.id = co.vehiculo_id
    join svas.cliente c  on c.id = v.cliente_id
   where co.id = p_cotizacion_id;

  select * into v_neg
    from svas.descuento d
   where d.cotizacion_id = p_cotizacion_id and d.aceptado and d.tipo = 'NEGOCIADO';

  -- RN-08 (igual que crear_orden_compra)
  v_primera := v_doc is null or not exists (
    select 1
      from svas.poliza po
      join svas.orden_compra o on o.id = po.orden_compra_id
      join svas.cotizacion co  on co.id = o.cotizacion_id
      join svas.vehiculo v     on v.id = co.vehiculo_id
      join svas.cliente c      on c.id = v.cliente_id
     where c.numero_documento = v_doc);
  select descuento_primera_compra into v_pc_pct from svas.parametros_comerciales where id = 1;

  -- RN-09 (igual que crear_orden_compra)
  if v_neg.id is not null and v_neg.plan_id = v_plan
     and (not v_primera or v_neg.porcentaje >= v_pc_pct) then
    return jsonb_build_object('tipo', 'NEGOCIADO', 'porcentaje', v_neg.porcentaje::text,
                              'provisional', false);
  elsif v_primera then
    return jsonb_build_object('tipo', 'PRIMERA_COMPRA', 'porcentaje', v_pc_pct::text,
                              'provisional', v_doc is null);
  end if;
  return null;
end;
$$;

-- ── Permisos ────────────────────────────────────────────────────────────────
revoke all on function svas.completar_datos_compra(uuid, text, text) from public, anon;
revoke all on function svas.vista_previa_descuento(uuid, uuid) from public, anon;
grant execute on function svas.completar_datos_compra(uuid, text, text) to authenticated;
grant execute on function svas.vista_previa_descuento(uuid, uuid) to authenticated;

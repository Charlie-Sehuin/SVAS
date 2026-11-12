-- 0034 · RPCs de compra: crear_orden_compra (6.3), confirmar_compra (6.4),
--        registrar_pago_rechazado, generar_cuotas (interna)
--        + actualizar_suma_asegurada v3 y detectar_cotizaciones_abandonadas v2 ("sin orden")
-- Fuente: contexto §5 (RN-06, RN-08, RN-09, RN-14, RN-15, RN-27, RN-37, RN-38, RN-45),
--         §6.3, §6.4, §6.10, §6.13; backend §4.3 y §6. El doc la ubica en 0013.
--
-- Errores: P0001 → 400 · P0002 → 404 · 42501 → 403 · PT409 → 409.
--
-- Ajustes propios (revisables):
--   · crear_orden_compra recibe además p_acepta_condiciones y p_firma_simulada
--     (columnas obligatorias de orden_compra, RF-24).
--   · Solo CLIENTE dueño: la compra exige cuenta (confirmar_compra también es
--     CLIENTE). Tras la retoma el cliente inicia sesión y compra con su JWT.
--   · Canal (RN-27) por evidencia en la base, no por lo que diga el frontend:
--     TELEMARKETING si se usó el enlace de retoma o hubo un intento ACEPTA;
--     ASESORIA si se aplica el descuento negociado; AUTONOMO en el resto.
--   · Descuento (RN-08/RN-09): entre el negociado aceptado (si es del mismo plan)
--     y el de primera compra queda el mayor; empate → el negociado.

-- ── Internas ────────────────────────────────────────────────────────────────

-- La orden como JSON (respuesta de los RPC y bitácora).
create or replace function svas._orden_json(p_orden_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = svas, public
as $$
  select jsonb_build_object(
    'id', o.id,
    'cotizacion_id', o.cotizacion_id,
    'prima_cotizada_id', o.prima_cotizada_id,
    'plan_id', pc.plan_id,
    'prima_anual', o.prima_anual::text,
    'descuento', case when o.descuento_id is null then null
                      else jsonb_build_object('tipo', o.descuento_tipo,
                                              'porcentaje', o.descuento_porcentaje::text) end,
    'prima_final', o.prima_final::text,
    'canal_venta', o.canal_venta,
    'fecha', o.fecha)
    from svas.orden_compra o
    join svas.prima_cotizada pc on pc.id = o.prima_cotizada_id
   where o.id = p_orden_id;
$$;

-- Cronograma de un pago en CUOTAS: partes iguales a 2 decimales; la última
-- absorbe el redondeo (RN-38). La 1 se cobra hoy; las demás, cada mes.
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

  insert into svas.cuota (pago_id, numero, monto, fecha_vencimiento, estado)
  select p_pago_id,
         n,
         case when n = v_pago.numero_cuotas
              then v_pago.monto - v_parte * (v_pago.numero_cuotas - 1)
              else v_parte end,
         (v_hoy + make_interval(months => n - 1))::date,
         case when n = 1 then 'CONFIRMADO'::svas.estado_pago else 'PENDIENTE'::svas.estado_pago end
    from generate_series(1, v_pago.numero_cuotas) n;
end;
$$;

-- Orden bloqueada y validada para pagar (dueño, sin pago confirmado, cotización viva).
create or replace function svas._orden_para_pagar(p_orden_id uuid)
returns svas.orden_compra
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v      svas.orden_compra;
  v_est  svas.estado_cotizacion;
begin
  select * into v from svas.orden_compra where id = p_orden_id for update;
  if not found then
    raise exception 'La compra no existe' using errcode = 'P0002';
  end if;
  if not svas.es_duenio_cotizacion(v.cotizacion_id) then
    raise exception 'No tienes permiso para pagar esta compra' using errcode = '42501';
  end if;
  if exists (select 1 from svas.pago where orden_compra_id = p_orden_id and estado = 'CONFIRMADO') then
    raise exception 'Esta compra ya está pagada' using errcode = 'PT409';
  end if;
  select estado into v_est from svas.cotizacion where id = v.cotizacion_id for update;
  if v_est = 'CONVERTIDA' then
    raise exception 'Esta cotización ya se convirtió en póliza' using errcode = 'PT409';
  end if;
  return v;
end;
$$;

revoke all on function svas._orden_json(uuid) from public, anon, authenticated, service_role;
revoke all on function svas.generar_cuotas(uuid) from public, anon, authenticated, service_role;
revoke all on function svas._orden_para_pagar(uuid) from public, anon, authenticated, service_role;

-- ── 6.3 crear_orden_compra ──────────────────────────────────────────────────
create or replace function svas.crear_orden_compra(
  p_cotizacion_id      uuid,
  p_prima_cotizada_id  uuid,
  p_origen             text,
  p_datos_faltantes    jsonb,
  p_contenido_plan     jsonb,
  p_acepta_condiciones boolean,
  p_firma_simulada     text
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_cot        record;
  v_prima      record;
  v_doc        text;
  v_placa      text;
  v_neg        svas.descuento;
  v_pc_pct     numeric;
  v_primera    boolean;
  v_desc_id    uuid;
  v_desc_tipo  svas.tipo_descuento;
  v_desc_pct   numeric;
  v_canal      svas.canal_venta;
  v_orden_id   uuid;
begin
  perform svas.exigir_rol(array['CLIENTE']);

  if p_origen is not null and p_origen <> 'RETOMA' then
    raise exception 'El origen de la compra no es válido';
  end if;

  select co.id, co.estado, v.id as vehiculo_id, v.placa, c.id as cliente_id, c.numero_documento
    into v_cot
    from svas.cotizacion co
    join svas.vehiculo v on v.id = co.vehiculo_id
    join svas.cliente c  on c.id = v.cliente_id
   where co.id = p_cotizacion_id
     for update of co;

  if not found then
    raise exception 'La cotización no existe' using errcode = 'P0002';
  end if;
  if not svas.es_duenio_cotizacion(p_cotizacion_id) then
    raise exception 'No tienes permiso para comprar con esta cotización' using errcode = '42501';
  end if;
  if v_cot.estado = 'CONVERTIDA' then
    raise exception 'Esta cotización ya se convirtió en póliza' using errcode = 'PT409';
  end if;
  if exists (select 1 from svas.orden_compra where cotizacion_id = p_cotizacion_id) then
    raise exception 'La cotización ya tiene una compra en curso' using errcode = 'PT409';
  end if;

  -- RF-24
  if p_acepta_condiciones is distinct from true then
    raise exception 'Debes aceptar las condiciones para continuar';
  end if;
  if coalesce(btrim(p_firma_simulada), '') = '' or length(btrim(p_firma_simulada)) > 120 then
    raise exception 'Escribe tu nombre completo como firma (máximo 120 caracteres)';
  end if;

  select pc.id, pc.plan_id, pc.prima, pc.disponible, p.activo as plan_activo,
         p.resumen, a.activa as aseguradora_activa
    into v_prima
    from svas.prima_cotizada pc
    join svas.plan p        on p.id = pc.plan_id
    join svas.aseguradora a on a.id = p.aseguradora_id
   where pc.id = p_prima_cotizada_id
     and pc.cotizacion_id = p_cotizacion_id;

  if not found then
    raise exception 'Ese plan no está en tu cotización' using errcode = 'P0002';
  end if;
  if not v_prima.disponible or not v_prima.plan_activo or not v_prima.aseguradora_activa then
    raise exception 'Ese plan ya no está disponible para comprar';
  end if;

  -- RN-06: la compra directa exige la opción habilitada o un descuento negociado aceptado.
  select * into v_neg
    from svas.descuento d
   where d.cotizacion_id = p_cotizacion_id and d.aceptado and d.tipo = 'NEGOCIADO';

  if not exists (select 1 from svas.cotizacion_opcion o
                  where o.cotizacion_id = p_cotizacion_id and o.opcion = 'COMPRA_INMEDIATA')
     and v_neg.id is null then
    raise exception 'Esta cotización debe completarse con un asesor';
  end if;

  -- RN-45: copia del contenido del plan elegido, y el plan debe estar completo.
  if p_contenido_plan is null or jsonb_typeof(p_contenido_plan) <> 'object' then
    raise exception 'Falta la copia del contenido del plan';
  end if;
  if (p_contenido_plan ->> 'planId') is distinct from v_prima.plan_id::text then
    raise exception 'La copia del contenido no corresponde al plan elegido';
  end if;
  if v_prima.resumen is null
     or exists (select 1 from svas.cobertura cb
                 where cb.activa
                   and not exists (select 1 from svas.plan_cobertura x
                                    where x.plan_id = v_prima.plan_id and x.cobertura_id = cb.id)) then
    raise exception 'El contenido de este plan está incompleto; por ahora no se puede comprar'
      using errcode = 'PT409';
  end if;

  -- Datos que faltaban (RNF-08): solo se completan si estaban vacíos.
  if p_datos_faltantes is not null and jsonb_typeof(p_datos_faltantes) <> 'object' then
    raise exception 'Los datos faltantes no son válidos';
  end if;
  v_doc   := coalesce(v_cot.numero_documento, upper(btrim(p_datos_faltantes ->> 'numero_documento')));
  v_placa := coalesce(v_cot.placa, upper(btrim(p_datos_faltantes ->> 'placa')));

  if coalesce(v_doc, '') = '' then
    raise exception 'Falta tu número de documento';
  end if;
  if v_doc !~ '^([0-9]{8}|[0-9A-Z]{9,12})$' then
    raise exception 'El número de documento debe tener 8 dígitos (DNI) o de 9 a 12 caracteres';
  end if;
  if coalesce(v_placa, '') = '' then
    raise exception 'Falta la placa del vehículo';
  end if;
  if v_placa !~ '^[A-Z0-9]{3}-?[0-9]{3}$' then
    raise exception 'La placa debe tener el formato ABC-123';
  end if;

  if v_cot.numero_documento is null then
    if exists (select 1 from svas.cliente c
                where c.numero_documento = v_doc and c.id <> v_cot.cliente_id) then
      raise exception 'Ese número de documento ya está registrado con otra cuenta' using errcode = 'PT409';
    end if;
    update svas.cliente set numero_documento = v_doc where id = v_cot.cliente_id;
  end if;
  if v_cot.placa is null then
    update svas.vehiculo set placa = v_placa where id = v_cot.vehiculo_id;
  end if;

  -- RN-08: primera compra si ningún cliente con ese documento tiene póliza.
  v_primera := not exists (
    select 1
      from svas.poliza po
      join svas.orden_compra o on o.id = po.orden_compra_id
      join svas.cotizacion co  on co.id = o.cotizacion_id
      join svas.vehiculo v     on v.id = co.vehiculo_id
      join svas.cliente c      on c.id = v.cliente_id
     where c.numero_documento = v_doc);
  select descuento_primera_compra into v_pc_pct from svas.parametros_comerciales where id = 1;

  -- RN-09: no acumulables; queda el mayor (empate → negociado).
  if v_neg.id is not null and v_neg.plan_id = v_prima.plan_id
     and (not v_primera or v_neg.porcentaje >= v_pc_pct) then
    v_desc_id := v_neg.id; v_desc_tipo := 'NEGOCIADO'; v_desc_pct := v_neg.porcentaje;
  elsif v_primera then
    update svas.descuento set aceptado = false
     where cotizacion_id = p_cotizacion_id and aceptado;
    insert into svas.descuento (cotizacion_id, plan_id, asesor_id, tipo, porcentaje, aceptado)
    values (p_cotizacion_id, v_prima.plan_id, null, 'PRIMERA_COMPRA', v_pc_pct, true)
    returning id into v_desc_id;
    v_desc_tipo := 'PRIMERA_COMPRA'; v_desc_pct := v_pc_pct;
  end if;

  -- RN-27
  if exists (select 1 from svas.seguimiento sg
              where sg.cotizacion_id = p_cotizacion_id and sg.enlace_usado_en is not null)
     or exists (select 1 from svas.intento_contacto i
                  join svas.seguimiento sg on sg.id = i.seguimiento_id
                 where sg.cotizacion_id = p_cotizacion_id and i.resultado = 'ACEPTA') then
    v_canal := 'TELEMARKETING';
  elsif v_desc_tipo = 'NEGOCIADO' then
    v_canal := 'ASESORIA';
  else
    v_canal := 'AUTONOMO';
  end if;

  insert into svas.orden_compra (
    cotizacion_id, prima_cotizada_id, prima_anual, descuento_id, descuento_tipo,
    descuento_porcentaje, prima_final, acepta_condiciones, firma_simulada,
    canal_venta, contenido_plan)
  values (
    p_cotizacion_id, p_prima_cotizada_id, v_prima.prima, v_desc_id, v_desc_tipo,
    v_desc_pct, round(v_prima.prima * (1 - coalesce(v_desc_pct, 0) / 100), 2), true,
    btrim(p_firma_simulada), v_canal,
    p_contenido_plan || jsonb_build_object('congeladoEn', now()))
  returning id into v_orden_id;

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'CREAR_ORDEN_COMPRA', 'orden_compra', v_orden_id,
          svas._orden_json(v_orden_id) || jsonb_build_object('origen', p_origen));

  return svas._orden_json(v_orden_id);
end;
$$;

-- ── registrar_pago_rechazado ────────────────────────────────────────────────
create or replace function svas.registrar_pago_rechazado(
  p_orden_id      uuid,
  p_modo          svas.modo_pago,
  p_numero_cuotas smallint,
  p_referencia    varchar,
  p_monto_total   numeric
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_pago_id uuid;
begin
  perform svas.exigir_rol(array['CLIENTE']);
  perform svas._orden_para_pagar(p_orden_id);

  -- T3 valida monto y cuotas (RN-14, RN-38).
  insert into svas.pago (orden_compra_id, monto, modo, estado, numero_cuotas, referencia)
  values (p_orden_id, p_monto_total, p_modo, 'RECHAZADO',
          case when p_modo = 'CUOTAS' then p_numero_cuotas end, p_referencia)
  returning id into v_pago_id;

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'PAGO_RECHAZADO', 'pago', v_pago_id,
          jsonb_build_object('orden_id', p_orden_id, 'modo', p_modo,
                             'monto', p_monto_total, 'referencia', p_referencia));

  return jsonb_build_object('pago_id', v_pago_id, 'estado', 'RECHAZADO');
end;
$$;

-- ── 6.4 confirmar_compra (todo o nada, RNF-05) ──────────────────────────────
create or replace function svas.confirmar_compra(
  p_orden_id      uuid,
  p_modo          svas.modo_pago,
  p_numero_cuotas smallint,
  p_referencia    varchar,
  p_numero_poliza varchar,
  p_monto_total   numeric
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_orden     svas.orden_compra;
  v_pago_id   uuid;
  v_poliza_id uuid := gen_random_uuid();
  v_archivo   text;
begin
  perform svas.exigir_rol(array['CLIENTE']);
  v_orden := svas._orden_para_pagar(p_orden_id);

  if p_modo is null then
    raise exception 'Indica el modo de pago';
  end if;
  if p_modo = 'CUOTAS' and p_numero_cuotas is null then
    raise exception 'Indica en cuántas cuotas quieres pagar';
  end if;
  -- RN-38: contado = prima_final; en cuotas puede haber recargo (lo calcula la Estrategia).
  if p_monto_total is null or p_monto_total < v_orden.prima_final
     or (p_modo = 'UNICO' and p_monto_total <> v_orden.prima_final) then
    raise exception 'Monto total inválido para el modo de pago';
  end if;
  if coalesce(btrim(p_numero_poliza), '') = '' then
    raise exception 'Falta el número de póliza';
  end if;

  insert into svas.pago (orden_compra_id, monto, modo, estado, numero_cuotas, referencia)
  values (p_orden_id, p_monto_total, p_modo, 'CONFIRMADO',
          case when p_modo = 'CUOTAS' then p_numero_cuotas end, p_referencia)
  returning id into v_pago_id;   -- uq_pago_confirmado_por_orden evita doble cobro

  perform svas.generar_cuotas(v_pago_id);

  v_archivo := 'polizas/' || v_poliza_id || '.pdf';
  insert into svas.poliza (id, orden_compra_id, canal_venta, numero, archivo_pdf)
  values (v_poliza_id, p_orden_id, v_orden.canal_venta, btrim(p_numero_poliza), v_archivo);  -- T4

  update svas.cotizacion set estado = 'CONVERTIDA' where id = v_orden.cotizacion_id;
  update svas.seguimiento
     set estado = 'CONVERTIDO', fecha_cierre = now()
   where cotizacion_id = v_orden.cotizacion_id and estado = 'EN_SEGUIMIENTO';

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'CONFIRMAR_COMPRA', 'poliza', v_poliza_id,
          jsonb_build_object('orden_id', p_orden_id, 'pago_id', v_pago_id, 'modo', p_modo,
                             'monto', p_monto_total, 'numero_poliza', btrim(p_numero_poliza)));

  return jsonb_build_object(
    'poliza_id', v_poliza_id,
    'numero_poliza', btrim(p_numero_poliza),
    'archivo_pdf', v_archivo,
    'pago_id', v_pago_id,
    'monto_total', p_monto_total::text,
    'cuotas', coalesce((select jsonb_agg(jsonb_build_object(
                                 'numero', c.numero, 'monto', c.monto::text,
                                 'fecha_vencimiento', c.fecha_vencimiento, 'estado', c.estado)
                               order by c.numero)
                          from svas.cuota c where c.pago_id = v_pago_id), '[]'::jsonb));
end;
$$;

-- ── 6.13 actualizar_suma_asegurada v3 (reemplaza la de 0028) ───────────────
-- Cambios: rechaza con 409 si la cotización ya tiene orden_compra (RN-37) y
-- el rechazo por CONVERTIDA también pasa a 409 (conexión §8). El resto es idéntico.
create or replace function svas.actualizar_suma_asegurada(
  p_cotizacion_id uuid,
  p_aseguradora_id uuid,
  p_primas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_cot         record;
  v_aseguradora text;
  v_rango       record;
  v_esperados   int;
  v_recibidos   int;
  v_sumas       int;
  v_suma        numeric;
  v_antes       numeric;
  v_invalidadas int;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    perform svas.exigir_rol(array['CLIENTE']);
    if not svas.es_duenio_cotizacion(p_cotizacion_id) then
      raise exception 'No tienes permiso para modificar esta cotización' using errcode = '42501';
    end if;
  end if;

  select co.id, co.estado, v.modelo_id, v.anio
    into v_cot
    from svas.cotizacion co
    join svas.vehiculo v on v.id = co.vehiculo_id
   where co.id = p_cotizacion_id
     for update of co;

  if not found then
    raise exception 'La cotización no existe' using errcode = 'P0002';
  end if;

  if v_cot.estado = 'CONVERTIDA' then
    raise exception 'Ya iniciaste tu compra: la suma asegurada ya no se puede cambiar.'
      using errcode = 'PT409';
  end if;

  if exists (select 1 from svas.orden_compra o where o.cotizacion_id = p_cotizacion_id) then
    raise exception 'La cotización ya tiene una compra en curso: la suma asegurada ya no se puede cambiar.'
      using errcode = 'PT409';
  end if;

  select a.nombre into v_aseguradora from svas.aseguradora a where a.id = p_aseguradora_id;
  if not found then
    raise exception 'La aseguradora no existe' using errcode = 'P0002';
  end if;

  if jsonb_typeof(p_primas) is distinct from 'array' or jsonb_array_length(p_primas) = 0 then
    raise exception 'Faltan las primas recalculadas';
  end if;

  select count(*)
    into v_esperados
    from svas.prima_cotizada pc
    join svas.plan p on p.id = pc.plan_id
   where pc.cotizacion_id = p_cotizacion_id
     and p.aseguradora_id = p_aseguradora_id;

  if v_esperados = 0 then
    raise exception 'La cotización no tiene planes de %', v_aseguradora using errcode = 'P0002';
  end if;

  -- Deben llegar todos los planes de esa aseguradora, una vez cada uno.
  select count(distinct pc.id)
    into v_recibidos
    from jsonb_array_elements(p_primas) e
    join svas.prima_cotizada pc on pc.cotizacion_id = p_cotizacion_id
                               and pc.plan_id = (e ->> 'plan_id')::uuid
    join svas.plan p            on p.id = pc.plan_id
                               and p.aseguradora_id = p_aseguradora_id;

  if v_recibidos <> v_esperados or jsonb_array_length(p_primas) <> v_esperados then
    raise exception 'Deben enviarse las primas de todos los planes de %', v_aseguradora;
  end if;

  if exists (select 1 from jsonb_array_elements(p_primas) e
              where not coalesce((e ->> 'disponible')::boolean, false)) then
    raise exception '% no puede cotizar este vehículo con esa suma asegurada', v_aseguradora;
  end if;

  select min((e ->> 'suma_asegurada')::numeric), count(distinct (e ->> 'suma_asegurada')::numeric)
    into v_suma, v_sumas
    from jsonb_array_elements(p_primas) e;

  if v_suma is null or v_sumas <> 1 then
    raise exception 'Los planes de una misma aseguradora deben tener la misma suma asegurada';
  end if;

  -- RN-37 (defensa en profundidad)
  select r.suma_minima, r.suma_maxima
    into v_rango
    from svas.rango_suma_asegurada r
   where r.aseguradora_id = p_aseguradora_id
     and r.modelo_id = v_cot.modelo_id
     and r.anio = v_cot.anio;

  if not found then
    raise exception '% no tiene rango de suma asegurada para este vehículo', v_aseguradora;
  end if;

  if v_suma < v_rango.suma_minima or v_suma > v_rango.suma_maxima then
    raise exception 'La suma asegurada de % debe estar entre % y %',
      v_aseguradora, svas.fmt_usd(v_rango.suma_minima), svas.fmt_usd(v_rango.suma_maxima);
  end if;

  select max(pc.suma_asegurada)
    into v_antes
    from svas.prima_cotizada pc
    join svas.plan p on p.id = pc.plan_id
   where pc.cotizacion_id = p_cotizacion_id
     and p.aseguradora_id = p_aseguradora_id;

  update svas.prima_cotizada pc
     set suma_asegurada       = v_suma,
         prima                = (e ->> 'prima')::numeric,
         prima_mensual        = (e ->> 'prima_mensual')::numeric,
         detalle_calculo      = case when jsonb_typeof(e -> 'detalle_calculo') = 'object'
                                     then e -> 'detalle_calculo' end,
         motivo_no_disponible = null,
         disponible           = true
    from jsonb_array_elements(p_primas) e
   where pc.cotizacion_id = p_cotizacion_id
     and pc.plan_id = (e ->> 'plan_id')::uuid;

  update svas.simulacion set vigente = false
   where cotizacion_id = p_cotizacion_id and vigente;
  get diagnostics v_invalidadas = row_count;

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'AJUSTAR_SUMA', 'cotizacion', p_cotizacion_id,
          jsonb_build_object('aseguradora_id', p_aseguradora_id,
                             'antes', v_antes,
                             'despues', v_suma,
                             'simulaciones_invalidadas', v_invalidadas));

  return jsonb_build_object(
    'primas', (select jsonb_agg(jsonb_build_object(
                        'id', pc.id,
                        'plan_id', pc.plan_id,
                        'suma_asegurada', pc.suma_asegurada::text,
                        'prima', pc.prima::text,
                        'prima_mensual', pc.prima_mensual::text) order by pc.prima)
                 from svas.prima_cotizada pc
                 join svas.plan p on p.id = pc.plan_id
                where pc.cotizacion_id = p_cotizacion_id
                  and p.aseguradora_id = p_aseguradora_id),
    'simulaciones_invalidadas', v_invalidadas);
end;
$$;

-- ── 6.10 detectar_cotizaciones_abandonadas v2 (reemplaza la de 0025) ────────
-- Único cambio: no abre seguimiento si la cotización ya tiene orden_compra
-- (el cliente está pagando, no abandonó).
create or replace function svas.detectar_cotizaciones_abandonadas()
returns int
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_horas smallint;
  v_n     int;
begin
  -- Dos instancias del job no corren a la vez (§11): lock de la transacción.
  if not pg_try_advisory_xact_lock(hashtext('svas.detector_abandono')) then
    return 0;
  end if;

  select horas_abandono into v_horas from svas.parametros_comerciales where id = 1;

  with abandonadas as (
    update svas.cotizacion co
       set estado = 'NO_CONCRETADA'
     where co.estado = 'REGISTRADA'
       and co.fecha < now() - make_interval(hours => v_horas)
       and not exists (select 1 from svas.solicitud_asesoria s
                        where s.cotizacion_id = co.id and s.estado <> 'CERRADA')
       and not exists (select 1 from svas.orden_compra o where o.cotizacion_id = co.id)
    returning co.id
  )
  insert into svas.seguimiento (cotizacion_id)
  select id from abandonadas
  on conflict (cotizacion_id) do nothing;

  get diagnostics v_n = row_count;

  if v_n > 0 then
    insert into svas.registro_actividad (usuario_id, accion, entidad, detalle)
    values (null, 'DETECTAR_ABANDONO', 'seguimiento', jsonb_build_object('abiertos', v_n));
  end if;

  return v_n;
end;
$$;

-- ── Permisos ────────────────────────────────────────────────────────────────
revoke all on function svas.crear_orden_compra(uuid, uuid, text, jsonb, jsonb, boolean, text)
  from public, anon;
revoke all on function svas.registrar_pago_rechazado(uuid, svas.modo_pago, smallint, varchar, numeric)
  from public, anon;
revoke all on function svas.confirmar_compra(uuid, svas.modo_pago, smallint, varchar, varchar, numeric)
  from public, anon;

grant execute on function svas.crear_orden_compra(uuid, uuid, text, jsonb, jsonb, boolean, text)
  to authenticated;
grant execute on function svas.registrar_pago_rechazado(uuid, svas.modo_pago, smallint, varchar, numeric)
  to authenticated;
grant execute on function svas.confirmar_compra(uuid, svas.modo_pago, smallint, varchar, varchar, numeric)
  to authenticated;

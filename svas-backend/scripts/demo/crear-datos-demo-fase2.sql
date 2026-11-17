-- Datos de demostración (fase 2): 70 cotizaciones con clientes ficticios que alimentan los reportes de
-- retención, descuentos negociados, Prueba de Choque, canales de venta y desempeño del asesor.
--
--   g  1- 8  abandonadas que el asesor recuperó por llamada  → seguimiento CONVERTIDO, venta TELEMARKETING
--   g  9-18  abandonadas descartadas                        → seguimiento DESCARTADO (con motivo)
--   g 19-30  abandonadas en seguimiento                     → EN_SEGUIMIENTO (0 a 2 intentos)
--   g 31-40  asesoría con descuento negociado               → venta ASESORIA
--   g 41-46  asesoría sin venta (cerrada, en atención, pendiente)
--   g 47-60  compra autónoma tras simular                   → venta AUTONOMO
--   g 61-70  cotizaciones de las últimas horas              → REGISTRADA
--
-- · Marca: correo clienteNNN@demo.svas.pe (NNN = 101..170) y apellidos "Demo NNN". Pólizas DEMO-2026-0101..0170.
-- · Usa a los asesores que ya existen (no crea usuarios de Auth). Sus nombres saldrán en el reporte de desempeño.
-- · No genera PDFs ni manda correos. Se borra con borrar-datos-demo.sql (borra fase 1 y fase 2).
-- · Requiere haber corrido antes la fase 1 solo por orden lógico; no depende de sus filas.
-- · Se ejecuta a mano: npx supabase db query --remote -f scripts/demo/crear-datos-demo-fase2.sql

do $demo$
declare
  v_asesores uuid[];
  v_n int;
begin
  if exists (select 1 from svas.cliente where email = 'cliente101@demo.svas.pe') then
    raise exception 'Ya existen datos demo de la fase 2: ejecuta primero borrar-datos-demo.sql';
  end if;

  select array_agg(id order by id) into v_asesores
    from svas.usuario where rol = 'ASESOR' and activo;
  if coalesce(array_length(v_asesores, 1), 0) = 0 then
    raise exception 'No hay asesores activos para atribuir los casos';
  end if;

  perform setseed(0.58);

  -- ── Base: una fila por cotización ─────────────────────────────────────────
  create temp table _d2 on commit drop as
  select g,
         100 + g as k,
         case when g <= 8 then 'TELE' when g <= 18 then 'DESC' when g <= 30 then 'SEG'
              when g <= 40 then 'ASES_CONV' when g <= 46 then 'ASES_NO'
              when g <= 60 then 'AUTO' else 'REC' end as grupo,
         case
           when g <= 30 then now() - interval '25 hours' - random() * interval '27 days'
           when g <= 60 then now() - interval '1 hour'   - random() * interval '28 days'
           else now() - interval '1 hour' - random() * interval '19 hours' end as fecha,
         v_asesores[1 + g % array_length(v_asesores, 1)] as asesor_id,
         (g % 5 <> 0) as con_sim,
         (random() * 0.999)::numeric as r_suma,
         (g % 3 = 0) as en_cuotas
    from generate_series(1, 70) g;

  alter table _d2
    add column cot_estado svas.estado_cotizacion, add column canal svas.canal_venta,
    add column tipo_desc svas.tipo_descuento, add column pct numeric(5,2),
    add column convertida boolean, add column ord_fecha timestamptz;

  update _d2 set
    convertida = grupo in ('TELE', 'ASES_CONV', 'AUTO'),
    cot_estado = case when grupo in ('TELE', 'ASES_CONV', 'AUTO') then 'CONVERTIDA'
                      when grupo in ('DESC', 'SEG') or g in (41, 42) then 'NO_CONCRETADA'
                      else 'REGISTRADA' end::svas.estado_cotizacion,
    canal = case grupo when 'TELE' then 'TELEMARKETING' when 'ASES_CONV' then 'ASESORIA' else 'AUTONOMO' end::svas.canal_venta,
    tipo_desc = case grupo when 'ASES_CONV' then 'NEGOCIADO' when 'TELE' then 'PRIMERA_COMPRA'
                           when 'AUTO' then 'PRIMERA_COMPRA' end::svas.tipo_descuento;

  update _d2 set pct = case tipo_desc
      when 'PRIMERA_COMPRA' then (select descuento_primera_compra from svas.parametros_comerciales where id = 1)
      when 'NEGOCIADO' then (array[6, 7, 8, 9, 10])[1 + g % 5]::numeric end;

  -- Fecha de la compra: cada grupo con su ritmo, siempre antes de ahora.
  update _d2 set ord_fecha = case grupo
      when 'TELE' then fecha + interval '24 hours' + (now() - (fecha + interval '24 hours')) * 0.9
      when 'ASES_CONV' then least(now() - interval '10 minutes', fecha + interval '1 hour' + random() * interval '2 days')
      else fecha + interval '25 minutes' end
   where convertida;

  select count(*) into v_n from _d2;
  if v_n <> 70 then raise exception 'Se esperaban 70 filas y hay %', v_n; end if;

  -- ── Las primas cotizadas: 3 planes por cotización (para comparar) ────────
  create temp table _pc on commit drop as
  with planes as (
    select id, aseguradora_id, (row_number() over (order by aseguradora_id, orden, nombre) - 1)::int as idx
      from svas.plan where activo
  ), n as (select count(*)::int as c from planes)
  select d.g, s.slot,
         pl.id as plan_id, pl.aseguradora_id, pl.idx,
         null::uuid as prima_id, null::numeric(12,2) as suma, null::numeric(12,2) as prima,
         null::numeric(12,2) as costo_real, null::int as ranking
    from _d2 d
    cross join (values (1, 0), (2, 3), (3, 7)) s(slot, desplaza)
    cross join n
    join planes pl on pl.idx = ((d.g - 1) + s.desplaza) % n.c;

  -- Una suma por cotización: dentro del rango de la aseguradora del plan 1; los 3 planes usan esa suma.
  create temp table _veh on commit drop as
  select d.g, r.modelo_id, r.anio, r.suma_minima, r.suma_maxima
    from _d2 d
    join _pc p on p.g = d.g and p.slot = 1
    cross join lateral (
      select modelo_id, anio, suma_minima, suma_maxima
        from svas.rango_suma_asegurada r
       where r.aseguradora_id = p.aseguradora_id and r.suma_minima >= 5000 and r.anio >= 2015 and d.g > 0
       order by random() limit 1) r;

  update _pc p set
    suma = least(v.suma_maxima, greatest(v.suma_minima,
             round((v.suma_minima + (v.suma_maxima - v.suma_minima) * d.r_suma) / 100) * 100))
    from _veh v, _d2 d where v.g = p.g and d.g = p.g;
  update _pc set prima = round(suma * (0.026 + 0.004 * (idx % 4) + 0.004 * random()::numeric), 2);
  update _pc set costo_real = round(prima + (200 + 1800 * random())::numeric, 2);
  update _pc p set ranking = x.rk
    from (select g, slot, row_number() over (partition by g order by costo_real, slot)::int as rk from _pc) x
   where x.g = p.g and x.slot = p.slot;

  -- Plan elegido por cada compra: si simuló, casi siempre el recomendado (ranking 1) pero no siempre.
  alter table _d2 add column slot_elegido int, add column prima_final numeric(12,2),
    add column prima numeric(12,2), add column plan_id uuid, add column suma numeric(12,2),
    add column modo svas.modo_pago, add column cuotas smallint, add column monto_pago numeric(12,2),
    add column cliente_id uuid, add column vehiculo_id uuid, add column cotizacion_id uuid,
    add column descuento_id uuid, add column orden_id uuid, add column pago_id uuid,
    add column poliza_id uuid default gen_random_uuid(), add column seguimiento_id uuid;

  update _d2 d set slot_elegido = (
    select p.slot from _pc p
     where p.g = d.g
       and p.ranking = case when d.con_sim and random() < 0.6 then 1
                            else 1 + floor(random() * 3)::int end
     limit 1)
   where d.convertida;
  -- (si el sorteo no encontró fila, se queda con el ranking 1)
  update _d2 d set slot_elegido = (select slot from _pc p where p.g = d.g and p.ranking = 1)
   where d.convertida and d.slot_elegido is null;

  update _d2 d set plan_id = p.plan_id, suma = p.suma, prima = p.prima
    from _pc p where p.g = d.g and p.slot = d.slot_elegido and d.convertida;
  update _d2 set prima_final = round(prima * (1 - pct / 100), 2) where convertida;
  update _d2 set
    modo = case when en_cuotas then 'CUOTAS'::svas.modo_pago else 'UNICO'::svas.modo_pago end,
    cuotas = case when en_cuotas then (array[3, 6, 12])[1 + (g / 3) % 3]::smallint end
   where convertida;
  update _d2 set monto_pago = case when modo = 'CUOTAS' then round(prima_final * 1.05, 2) else prima_final end
   where convertida;

  -- ── Clientes, vehículos, ubicación, cotizaciones ─────────────────────────
  with nuevos as (
    insert into svas.cliente (nombres, apellidos, numero_documento, telefono, email, creado_en)
    select 'Cliente', 'Demo ' || k, '9901' || lpad(g::text, 4, '0'), '99901' || lpad(g::text, 4, '0'),
           'cliente' || k || '@demo.svas.pe', fecha - interval '30 minutes'
      from _d2
    returning id, email
  )
  update _d2 d set cliente_id = nv.id from nuevos nv where nv.email = 'cliente' || d.k || '@demo.svas.pe';

  with nuevos as (
    insert into svas.vehiculo (cliente_id, uso, modelo_id, anio, placa, creado_en)
    select d.cliente_id, 'PARTICULAR', v.modelo_id, v.anio, 'DEN-' || lpad(d.g::text, 3, '0'), d.fecha - interval '25 minutes'
      from _d2 d join _veh v on v.g = d.g
    returning id, placa
  )
  update _d2 d set vehiculo_id = nv.id from nuevos nv where nv.placa = 'DEN-' || lpad(d.g::text, 3, '0');

  insert into svas.ubicacion_uso (vehiculo_id, ubigeo)
  select d.vehiculo_id, (select codigo from svas.ubigeo u where d.g > 0 order by random() limit 1) from _d2 d;

  with nuevos as (
    insert into svas.cotizacion (vehiculo_id, fecha, estado, token_acceso_hash)
    select vehiculo_id, fecha, cot_estado,
           encode(sha256(convert_to('demo2-' || g || '-' || gen_random_uuid()::text, 'UTF8')), 'hex')
      from _d2
    returning id, vehiculo_id
  )
  update _d2 d set cotizacion_id = nv.id from nuevos nv where nv.vehiculo_id = d.vehiculo_id;

  insert into svas.cotizacion_opcion (cotizacion_id, opcion)
  select cotizacion_id, case when grupo in ('ASES_CONV', 'ASES_NO') then 'ASESORIA' else 'COMPRA_INMEDIATA' end::svas.opcion_venta
    from _d2;

  with nuevos as (
    insert into svas.prima_cotizada (cotizacion_id, plan_id, suma_asegurada, prima, prima_mensual, detalle_calculo, disponible)
    select d.cotizacion_id, p.plan_id, p.suma, p.prima, round(p.prima * 1.05 / 12, 2),
           jsonb_build_object('demo', true, 'sumaAsegurada', p.suma::text, 'primaAnual', p.prima::text,
                              'totalEnCuotas', round(p.prima * 1.05, 2)::text), true
      from _pc p join _d2 d on d.g = p.g
    returning id, cotizacion_id, plan_id
  )
  update _pc p set prima_id = nv.id
    from nuevos nv join _d2 d on d.cotizacion_id = nv.cotizacion_id
   where d.g = p.g and nv.plan_id = p.plan_id;

  -- ── Simulaciones de la Prueba de Choque (80 % de las cotizaciones) ───────
  create temp table _sim on commit drop as
  select d.g, d.cotizacion_id, gen_random_uuid() as sim_id,
         d.fecha + interval '5 minutes' as fecha,
         (array['ALTA', 'MEDIA', 'BAJA'])[1 + floor(random() * 3)::int]::svas.zona_riesgo as zona,
         (random() < 0.5) as km_alto, (random() < 0.4) as nocturno, (random() < 0.6) as cochera,
         (select jsonb_agg(c order by c) from (
            select distinct (array['CHOQUE_FUERTE', 'CHOQUE_LEVE', 'DANO_TERCEROS', 'PERDIDA_TOTAL', 'ROBO_AUTOPARTES', 'ROBO_TOTAL'])
                     [1 + floor(random() * 6)::int] as c
              from generate_series(1, 1 + d.g % 2)) x) as preoc
    from _d2 d where d.con_sim;

  insert into svas.simulacion (id, cotizacion_id, perfil, zona, fecha, version_reglas, vigente)
  select sim_id, cotizacion_id,
         jsonb_build_object('kmMesAlto', km_alto, 'usoNocturno', nocturno, 'estacionaCochera', cochera,
                            'preocupaciones', coalesce(preoc, '[]'::jsonb), 'ingresoDiarioSoles', null),
         zona, fecha, '94119f90c587', true
    from _sim;

  insert into svas.simulacion_plan (simulacion_id, prima_cotizada_id, costo_real_anual, peor_caso, ranking, datos_completos)
  select s.sim_id, p.prima_id, p.costo_real, round(p.costo_real + (500 + 3000 * random())::numeric, 2), p.ranking, true
    from _sim s join _pc p on p.g = s.g;

  -- ── Descuentos ──────────────────────────────────────────────────────────
  -- Primera compra (sistema) en las compras TELE y AUTO; negociados (asesor) en las ASES_CONV y en 4 casos sin venta.
  with nuevos as (
    insert into svas.descuento (cotizacion_id, plan_id, asesor_id, tipo, porcentaje, fecha, aceptado)
    select d.cotizacion_id,
           coalesce(d.plan_id, (select p.plan_id from _pc p where p.g = d.g and p.slot = 1)),
           case when coalesce(d.tipo_desc, 'NEGOCIADO') = 'NEGOCIADO' then d.asesor_id end,
           coalesce(d.tipo_desc, 'NEGOCIADO'),
           coalesce(d.pct, (array[6, 8, 10, 7])[d.g - 40]::numeric),
           case when d.convertida then d.ord_fecha - interval '1 minute'
                else d.fecha + (now() - d.fecha) * 0.4 end,
           (d.convertida or d.g = 43)
      from _d2 d
     where d.convertida or d.g between 41 and 44
    returning id, cotizacion_id
  )
  update _d2 d set descuento_id = nv.id from nuevos nv where nv.cotizacion_id = d.cotizacion_id;

  -- ── Órdenes, pagos, cuotas, pólizas de las compras ──────────────────────
  with nuevos as (
    insert into svas.orden_compra (cotizacion_id, prima_cotizada_id, prima_anual, descuento_id, descuento_tipo,
                                   descuento_porcentaje, prima_final, acepta_condiciones, firma_simulada,
                                   canal_venta, contenido_plan, fecha)
    select d.cotizacion_id, p.prima_id, d.prima, d.descuento_id, d.tipo_desc, d.pct, d.prima_final, true,
           'Cliente Demo ' || d.k, d.canal,
           jsonb_build_object(
             'aseguradora', (select a.nombre from svas.aseguradora a where a.id = pl.aseguradora_id),
             'plan', pl.nombre, 'planId', pl.id, 'descripcion', pl.descripcion,
             'resumen', pl.resumen, 'idealPara', pl.ideal_para,
             'exclusiones', coalesce((select jsonb_agg(x.texto order by x.orden)
                                        from svas.plan_exclusion x where x.plan_id = pl.id and x.activa), '[]'::jsonb),
             'requisitos', coalesce((select jsonb_agg(jsonb_build_object(
                                        'tipo', r.tipo, 'texto', r.texto, 'obligatorio', r.obligatorio) order by r.orden)
                                       from svas.plan_requisito r where r.plan_id = pl.id and r.activo), '[]'::jsonb),
             'actualizadoEn', pl.contenido_actualizado_en,
             'coberturas', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'orden', cb.orden, 'codigo', cb.codigo, 'nombre', cb.nombre, 'detalle', pcb.detalle,
                        'incluida', pcb.incluida, 'categoria', cb.categoria, 'limiteMonto', pcb.limite_monto::text)
                      order by cb.orden)
                 from svas.plan_cobertura pcb
                 join svas.cobertura cb on cb.id = pcb.cobertura_id
                where pcb.plan_id = pl.id and cb.activa), '[]'::jsonb),
             'congeladoEn', d.ord_fecha),
           d.ord_fecha
      from _d2 d
      join _pc p on p.g = d.g and p.slot = d.slot_elegido
      join svas.plan pl on pl.id = d.plan_id
     where d.convertida
    returning id, cotizacion_id
  )
  update _d2 d set orden_id = nv.id from nuevos nv where nv.cotizacion_id = d.cotizacion_id;

  with nuevos as (
    insert into svas.pago (orden_compra_id, monto, modo, estado, numero_cuotas, referencia, fecha)
    select orden_id, monto_pago, modo, 'CONFIRMADO', cuotas, 'DEMO-' || lpad(k::text, 4, '0'), ord_fecha + interval '1 minute'
      from _d2 where convertida
    returning id, orden_compra_id
  )
  update _d2 d set pago_id = nv.id from nuevos nv where nv.orden_compra_id = d.orden_id;

  insert into svas.cuota (pago_id, numero, monto, fecha_vencimiento, estado)
  select d.pago_id, c,
         case when c = d.cuotas then d.monto_pago - round(d.monto_pago / d.cuotas, 2) * (d.cuotas - 1)
              else round(d.monto_pago / d.cuotas, 2) end,
         ((d.ord_fecha at time zone 'America/Lima')::date + make_interval(months => c - 1))::date,
         case when c = 1 then 'CONFIRMADO'::svas.estado_pago else 'PENDIENTE'::svas.estado_pago end
    from _d2 d, generate_series(1, 24) c
   where d.convertida and d.modo = 'CUOTAS' and c <= d.cuotas;

  insert into svas.poliza (id, orden_compra_id, canal_venta, numero, fecha_emision, archivo_pdf, pdf_generado_en)
  select poliza_id, orden_id, canal, 'DEMO-2026-' || lpad(k::text, 4, '0'),
         ord_fecha + interval '2 minutes', 'polizas/' || poliza_id || '.pdf', ord_fecha + interval '3 minutes'
    from _d2 where convertida;

  -- ── Seguimientos (retención) de las abandonadas g 1-30 ──────────────────
  create temp table _seg on commit drop as
  select d.g, d.grupo, d.cotizacion_id, d.asesor_id,
         d.fecha + interval '24 hours' as apertura,
         case d.grupo when 'TELE' then 2 + d.g % 2
                      when 'DESC' then 1 + d.g % 3
                      else d.g % 3 end as n_intentos,
         gen_random_uuid() as id
    from _d2 d where d.g <= 30;

  insert into svas.seguimiento (id, cotizacion_id, estado, intentos, fecha_apertura, fecha_cierre, motivo_cierre,
                                enlace_token, enlace_expira_en, enlace_usado_en)
  select s.id, s.cotizacion_id,
         (case s.grupo when 'TELE' then 'CONVERTIDO' when 'DESC' then 'DESCARTADO' else 'EN_SEGUIMIENTO' end)::svas.estado_seguimiento,
         s.n_intentos, s.apertura,
         case when s.grupo = 'SEG' then null
              when s.grupo = 'TELE' then d.ord_fecha + interval '2 minutes'
              else s.apertura + (now() - s.apertura) * 0.9 end,
         case when s.grupo = 'DESC'
              then (array['PRECIO', 'YA_CONTRATO', 'NO_RESPONDE', 'SIN_INTERES', 'OTRO'])[1 + s.g % 5]::svas.motivo_cierre end,
         case when s.grupo = 'TELE'
              then encode(sha256(convert_to('retoma-' || s.g || gen_random_uuid()::text, 'UTF8')), 'hex') end,
         case when s.grupo = 'TELE' then s.apertura + interval '7 days' end,
         case when s.grupo = 'TELE' then d.ord_fecha - interval '5 minutes' end
    from _seg s join _d2 d on d.g = s.g;

  insert into svas.intento_contacto (seguimiento_id, asesor_id, canal, fecha, resultado)
  select s.id, s.asesor_id,
         (array['LLAMADA', 'WHATSAPP'])[1 + (s.g + i) % 2]::svas.canal_contacto,
         s.apertura + (now() - s.apertura) * 0.8 * i / (s.n_intentos + 1.0),
         (case
            when s.grupo = 'TELE' and i = s.n_intentos then 'ACEPTA'
            when s.grupo = 'TELE' then (array['NO_RESPONDE', 'CONTACTADO'])[1 + (s.g + i) % 2]
            when s.grupo = 'DESC' and i = s.n_intentos then (array['RECHAZA', 'NO_RESPONDE'])[1 + s.g % 2]
            when s.grupo = 'DESC' then 'NO_RESPONDE'
            else (array['NO_RESPONDE', 'CONTACTADO'])[1 + (s.g + i) % 2] end)::svas.resultado_intento
    from _seg s, generate_series(1, 3) i
   where i <= s.n_intentos;

  -- ── Solicitudes de asesoría (g 31-46) ───────────────────────────────────
  insert into svas.solicitud_asesoria (cotizacion_id, asesor_id, motivo, estado, canal, origen, fecha_creacion, resultado)
  select d.cotizacion_id,
         case when d.g >= 45 then null else d.asesor_id end,
         (array['NEGOCIACION', 'DESCUENTO', 'DUDA'])[1 + d.g % 3]::svas.motivo_asesoria,
         (case when d.g <= 42 then 'CERRADA' when d.g <= 44 then 'EN_ATENCION' else 'PENDIENTE' end)::svas.estado_solicitud,
         (array['LLAMADA', 'WHATSAPP'])[1 + d.g % 2]::svas.canal_contacto,
         'CLIENTE'::svas.origen_caso,
         d.fecha + (now() - d.fecha) * 0.2,
         case when d.g <= 40 then 'Se acordó el descuento y el cliente concretó la compra'
              when d.g <= 42 then 'El cliente no aceptó la propuesta' end
    from _d2 d where d.g between 31 and 46;

  raise notice 'Fase 2 creada: % cotizaciones, % pólizas, % seguimientos',
    (select count(*) from _d2), (select count(*) from _d2 where convertida), (select count(*) from _seg);
end
$demo$;

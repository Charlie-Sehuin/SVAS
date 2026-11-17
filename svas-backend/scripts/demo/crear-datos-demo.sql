-- Datos de demostración (fase 1): 45 clientes ficticios y 60 pólizas repartidas en los últimos 30 días,
-- para que los reportes de ventas y de descuento de primera compra tengan algo que mostrar.
--
-- · Todo lo ficticio queda marcado: correo clienteNN@demo.svas.pe y apellidos "Demo NN".
--   (los correos @demo.svas.pe nunca reciben mensajes: ver esCorreoDeDemostracion en el backend.)
-- · No crea usuarios de Auth, no genera PDFs ni manda correos.
-- · Se borra con borrar-datos-demo.sql (solo toca filas marcadas).
-- · No es una migración: se ejecuta a mano (npx supabase db query --remote -f scripts/demo/crear-datos-demo.sql).
-- · Si ya hay datos demo, se detiene sin tocar nada.

do $demo$
declare
  v_n int;
begin
  if exists (select 1 from svas.cliente where email ~* '^cliente[0-9]{2}@demo\.svas\.pe$') then
    raise exception 'Ya existen datos de demostración: ejecuta primero borrar-datos-demo.sql';
  end if;

  perform setseed(0.37);

  create temp table _demo on commit drop as
  with
  -- 45 clientes; los 15 primeros vuelven a comprar (2.ª póliza, otro vehículo, sin descuento de primera compra).
  pol as (
    select g as n,
           case when g <= 45 then g else g - 45 end as k,
           g > 45 as repite
      from generate_series(1, 60) g
  ),
  fechas as (            -- dos fechas al azar por cliente repetidor: la primera compra es la más antigua
    select k, least(f1, f2) as fecha_1, greatest(f1, f2) as fecha_2
      from (select k,
                   now() - random() * interval '30 days' - interval '1 hour' as f1,
                   now() - random() * interval '30 days' - interval '1 hour' as f2
              from generate_series(1, 15) k) x
    union all
    select k, now() - random() * interval '30 days' - interval '1 hour', null
      from generate_series(16, 45) k
  ),
  planes as (
    select id, aseguradora_id, nombre,
           (row_number() over (order by aseguradora_id, orden, nombre) - 1)::int as idx
      from svas.plan where activo
  ),
  base as (
    select p.n, p.k, p.repite,
           case when p.repite then f.fecha_2 else f.fecha_1 end as fecha,
           pl.id as plan_id, pl.aseguradora_id, pl.nombre as plan_nombre, pl.idx
      from pol p
      join fechas f on f.k = p.k
      join planes pl on pl.idx = (p.n - 1) % (select count(*) from planes)
  )
  select b.*, r.modelo_id, r.anio, r.suma_minima, r.suma_maxima
    from base b
    cross join lateral (
      select modelo_id, anio, suma_minima, suma_maxima
        from svas.rango_suma_asegurada r
       where r.aseguradora_id = b.aseguradora_id
         and r.suma_minima >= 5000
         and r.anio >= 2015
         and b.n > 0                       -- fuerza una evaluación por fila
       order by random()
       limit 1) r;

  select count(*) into v_n from _demo;
  if v_n <> 60 then
    raise exception 'Se esperaban 60 filas base y hay %', v_n;
  end if;

  alter table _demo
    add column cliente_id uuid, add column vehiculo_id uuid, add column cotizacion_id uuid,
    add column prima_cotizada_id uuid, add column orden_id uuid, add column descuento_id uuid,
    add column pago_id uuid, add column poliza_id uuid default gen_random_uuid(),
    add column suma numeric(12,2), add column prima numeric(12,2),
    add column pct numeric(5,2), add column prima_final numeric(12,2),
    add column modo svas.modo_pago, add column cuotas smallint, add column monto_pago numeric(12,2);

  -- Suma, descuento (solo primera compra) y modo de pago (1 de cada 3 en cuotas).
  update _demo set
    suma = least(suma_maxima, greatest(suma_minima,
             round((suma_minima + (suma_maxima - suma_minima) * random()::numeric) / 100) * 100)),
    pct  = case when repite then null
                else (select descuento_primera_compra from svas.parametros_comerciales where id = 1) end,
    modo = case when n % 3 = 0 then 'CUOTAS'::svas.modo_pago else 'UNICO'::svas.modo_pago end,
    cuotas = case when n % 3 = 0 then (array[3, 6, 12])[1 + (n / 3) % 3]::smallint end;

  update _demo set prima = round(suma * (0.026 + 0.004 * (idx % 4) + 0.004 * random()::numeric), 2);
  update _demo set prima_final = round(prima * (1 - coalesce(pct, 0) / 100), 2);
  update _demo set monto_pago = case when modo = 'CUOTAS' then round(prima_final * 1.05, 2) else prima_final end;

  -- Clientes (uno por k).
  with nuevos as (
    insert into svas.cliente (nombres, apellidos, numero_documento, telefono, email, creado_en)
    select 'Cliente', 'Demo ' || lpad(k::text, 2, '0'),
           '9900' || lpad(k::text, 4, '0'),
           '99900' || lpad(k::text, 4, '0'),
           'cliente' || lpad(k::text, 2, '0') || '@demo.svas.pe',
           min(fecha) - interval '30 minutes'
      from _demo group by k
    returning id, email
  )
  update _demo d set cliente_id = nv.id
    from nuevos nv
   where nv.email = 'cliente' || lpad(d.k::text, 2, '0') || '@demo.svas.pe';

  -- Vehículos (uno por póliza).
  with nuevos as (
    insert into svas.vehiculo (cliente_id, uso, modelo_id, anio, placa, creado_en)
    select cliente_id, 'PARTICULAR', modelo_id, anio, 'DEM-' || lpad(n::text, 3, '0'), fecha - interval '25 minutes'
      from _demo
    returning id, placa
  )
  update _demo d set vehiculo_id = nv.id
    from nuevos nv where nv.placa = 'DEM-' || lpad(d.n::text, 3, '0');

  insert into svas.ubicacion_uso (vehiculo_id, ubigeo)
  select d.vehiculo_id,
         (select codigo from svas.ubigeo u where d.n > 0 order by random() limit 1)
    from _demo d;

  -- Cotizaciones ya convertidas.
  with nuevos as (
    insert into svas.cotizacion (vehiculo_id, fecha, estado, token_acceso_hash)
    select vehiculo_id, fecha - interval '20 minutes', 'CONVERTIDA',
           encode(sha256(convert_to('demo-' || n || '-' || gen_random_uuid()::text, 'UTF8')), 'hex')
      from _demo
    returning id, vehiculo_id
  )
  update _demo d set cotizacion_id = nv.id from nuevos nv where nv.vehiculo_id = d.vehiculo_id;

  insert into svas.cotizacion_opcion (cotizacion_id, opcion)
  select cotizacion_id, 'COMPRA_INMEDIATA' from _demo;

  -- Prima cotizada del plan elegido.
  with nuevos as (
    insert into svas.prima_cotizada (cotizacion_id, plan_id, suma_asegurada, prima, prima_mensual, detalle_calculo, disponible)
    select cotizacion_id, plan_id, suma, prima, round(prima * 1.05 / 12, 2),
           jsonb_build_object('demo', true, 'sumaAsegurada', suma::text, 'primaAnual', prima::text,
                              'totalEnCuotas', round(prima * 1.05, 2)::text),
           true
      from _demo
    returning id, cotizacion_id
  )
  update _demo d set prima_cotizada_id = nv.id from nuevos nv where nv.cotizacion_id = d.cotizacion_id;

  -- Descuento de primera compra (RN-08): solo en la primera póliza de cada cliente.
  with nuevos as (
    insert into svas.descuento (cotizacion_id, plan_id, asesor_id, tipo, porcentaje, fecha, aceptado)
    select cotizacion_id, plan_id, null, 'PRIMERA_COMPRA', pct, fecha - interval '5 minutes', true
      from _demo where pct is not null
    returning id, cotizacion_id
  )
  update _demo d set descuento_id = nv.id from nuevos nv where nv.cotizacion_id = d.cotizacion_id;

  -- Orden de compra, con la copia del plan (RN-45) armada igual que la real.
  with nuevos as (
    insert into svas.orden_compra (cotizacion_id, prima_cotizada_id, prima_anual, descuento_id, descuento_tipo,
                                   descuento_porcentaje, prima_final, acepta_condiciones, firma_simulada,
                                   canal_venta, contenido_plan, fecha)
    select d.cotizacion_id, d.prima_cotizada_id, d.prima, d.descuento_id,
           case when d.pct is not null then 'PRIMERA_COMPRA'::svas.tipo_descuento end,
           d.pct, d.prima_final, true, 'Cliente Demo ' || lpad(d.k::text, 2, '0'), 'AUTONOMO',
           jsonb_build_object(
             'aseguradora', (select a.nombre from svas.aseguradora a where a.id = p.aseguradora_id),
             'plan', p.nombre, 'planId', p.id, 'descripcion', p.descripcion,
             'resumen', p.resumen, 'idealPara', p.ideal_para,
             'exclusiones', coalesce((select jsonb_agg(x.texto order by x.orden)
                                        from svas.plan_exclusion x where x.plan_id = p.id and x.activa), '[]'::jsonb),
             'requisitos', coalesce((select jsonb_agg(jsonb_build_object(
                                        'tipo', r.tipo, 'texto', r.texto, 'obligatorio', r.obligatorio) order by r.orden)
                                       from svas.plan_requisito r where r.plan_id = p.id and r.activo), '[]'::jsonb),
             'actualizadoEn', p.contenido_actualizado_en,
             'coberturas', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'orden', cb.orden, 'codigo', cb.codigo, 'nombre', cb.nombre, 'detalle', pcb.detalle,
                        'incluida', pcb.incluida, 'categoria', cb.categoria, 'limiteMonto', pcb.limite_monto::text)
                      order by cb.orden)
                 from svas.plan_cobertura pcb
                 join svas.cobertura cb on cb.id = pcb.cobertura_id
                where pcb.plan_id = p.id and cb.activa), '[]'::jsonb),
             'congeladoEn', d.fecha),
           d.fecha
      from _demo d join svas.plan p on p.id = d.plan_id
    returning id, cotizacion_id
  )
  update _demo d set orden_id = nv.id from nuevos nv where nv.cotizacion_id = d.cotizacion_id;

  -- Pago confirmado (referencia DEMO-NNNN) y cuotas (la 1.ª pagada, las demás pendientes: igual que confirmar_compra).
  with nuevos as (
    insert into svas.pago (orden_compra_id, monto, modo, estado, numero_cuotas, referencia, fecha)
    select orden_id, monto_pago, modo, 'CONFIRMADO', cuotas, 'DEMO-' || lpad(n::text, 4, '0'), fecha + interval '1 minute'
      from _demo
    returning id, orden_compra_id
  )
  update _demo d set pago_id = nv.id from nuevos nv where nv.orden_compra_id = d.orden_id;

  insert into svas.cuota (pago_id, numero, monto, fecha_vencimiento, estado)
  select d.pago_id, c,
         case when c = d.cuotas then d.monto_pago - round(d.monto_pago / d.cuotas, 2) * (d.cuotas - 1)
              else round(d.monto_pago / d.cuotas, 2) end,
         ((d.fecha at time zone 'America/Lima')::date + make_interval(months => c - 1))::date,
         case when c = 1 then 'CONFIRMADO'::svas.estado_pago else 'PENDIENTE'::svas.estado_pago end
    from _demo d, generate_series(1, 24) c
   where d.modo = 'CUOTAS' and c <= d.cuotas;

  -- Póliza. pdf_generado_en se marca para que el job de regeneración NO fabrique PDFs de estos datos.
  insert into svas.poliza (id, orden_compra_id, canal_venta, numero, fecha_emision, archivo_pdf, pdf_generado_en)
  select poliza_id, orden_id, 'AUTONOMO',
         'DEMO-2026-' || lpad(n::text, 4, '0'),
         fecha + interval '2 minutes', 'polizas/' || poliza_id || '.pdf', fecha + interval '3 minutes'
    from _demo;

  raise notice 'Datos demo creados: % pólizas', (select count(*) from _demo);
end
$demo$;

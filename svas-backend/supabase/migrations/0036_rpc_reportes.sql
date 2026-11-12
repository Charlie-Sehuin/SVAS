-- 0036 · Reportes (Ola 4): ventas, retención, descuentos, impacto de la Prueba
--        de Choque y desempeño del asesor. Solo lectura y agregados.
-- Fuente: contexto §3.9, §10, §16.7; doc conexión §6 "Reportes"; backend §3 (reportes).
--
-- Errores: P0001 → 400 · 42501 → 403.
--
-- Ajustes propios (revisables):
--   · Funciones (no vistas): reciben el periodo y exigen el rol dentro, como el resto de RPC.
--   · Periodo en días de Lima, ambos extremos incluidos, máximo 366 días.
--   · Ventas = pólizas emitidas en el periodo (fecha_emision) con su pago confirmado.
--     Aseguradora y plan salen de la copia congelada de la orden (RN-45): el nombre del momento de la venta.
--   · Retención = seguimientos abiertos en el periodo (cohorte), con su estado actual.
--   · Descuentos negociados = otorgados en el periodo; "convertido" si su orden terminó en póliza.
--   · Prueba de Choque = cotizaciones creadas en el periodo; se usa su última simulación.
--     El cruce con RN-35 queda en null hasta que exista el mensaje final con el resumen.
--   · Desempeño del asesor: sus asesorías, sus intentos, sus descuentos y las ventas que se le
--     atribuyen (descuento negociado suyo o TELEMARKETING con un intento ACEPTA suyo).
--   · Nunca se expone el ingreso diario del perfil (RN-36).

-- ── Internas ────────────────────────────────────────────────────────────────
create or replace function svas._validar_periodo(p_desde date, p_hasta date)
returns void
language plpgsql
immutable
set search_path = svas, public
as $$
begin
  if p_desde is null or p_hasta is null then
    raise exception 'Indica el periodo: desde y hasta';
  end if;
  if p_desde > p_hasta then
    raise exception 'La fecha "desde" no puede ser posterior a "hasta"';
  end if;
  if p_hasta - p_desde > 366 then
    raise exception 'El periodo no puede superar un año';
  end if;
end;
$$;

-- % con 2 decimales como texto; null si no hay base.
create or replace function svas._pct(p_parte numeric, p_total numeric)
returns text
language sql
immutable
as $$
  select case when coalesce(p_total, 0) = 0 then null
              else round(100.0 * p_parte / p_total, 2)::text end;
$$;

-- Embudo de retención de una cohorte; p_asesor filtra a los seguimientos donde él intentó contacto.
create or replace function svas._reporte_retencion(p_desde date, p_hasta date, p_asesor uuid)
returns jsonb
language sql
stable
security definer
set search_path = svas, public
as $$
  with s as (
    select sg.*
      from svas.seguimiento sg
     where (sg.fecha_apertura at time zone 'America/Lima')::date between p_desde and p_hasta
       and (p_asesor is null
            or exists (select 1 from svas.intento_contacto i
                        where i.seguimiento_id = sg.id and i.asesor_id = p_asesor))
  ),
  i as (
    select i.*
      from svas.intento_contacto i
      join s on s.id = i.seguimiento_id
     where p_asesor is null or i.asesor_id = p_asesor
  ),
  t as (
    select count(*)                                                     as abiertos,
           count(*) filter (where s.intentos > 0)                       as con_intentos,
           count(*) filter (where exists (
             select 1 from svas.intento_contacto x
              where x.seguimiento_id = s.id
                and x.resultado in ('CONTACTADO', 'RECHAZA', 'ACEPTA')))  as contactados,
           count(*) filter (where exists (
             select 1 from svas.intento_contacto x
              where x.seguimiento_id = s.id and x.resultado = 'ACEPTA'))  as aceptaron,
           count(*) filter (where s.enlace_usado_en is not null)        as enlace_usado,
           count(*) filter (where s.estado = 'CONVERTIDO')              as convertidos,
           count(*) filter (where s.estado = 'DESCARTADO')              as descartados,
           count(*) filter (where s.estado = 'EN_SEGUIMIENTO')          as en_seguimiento,
           avg(extract(epoch from s.fecha_cierre - s.fecha_apertura) / 86400)
             filter (where s.estado = 'CONVERTIDO')                     as dias_conversion
      from s
  )
  select jsonb_build_object(
    'abiertos',        t.abiertos,
    'conIntentos',     t.con_intentos,
    'contactados',     t.contactados,
    'aceptaron',       t.aceptaron,
    'enlaceUsado',     t.enlace_usado,
    'convertidos',     t.convertidos,
    'descartados',     t.descartados,
    'enSeguimiento',   t.en_seguimiento,
    'tasaConversion',  svas._pct(t.convertidos, t.abiertos),
    'diasPromedioConversion', round(t.dias_conversion, 1)::text,
    'descartadosPorMotivo', (
      select jsonb_object_agg(m::text, coalesce(x.n, 0) order by m)
        from unnest(enum_range(null::svas.motivo_cierre)) m
        left join (select motivo_cierre, count(*) n from s
                    where estado = 'DESCARTADO' group by 1) x on x.motivo_cierre = m),
    'intentos', jsonb_build_object(
      'total', (select count(*) from i),
      'porResultado', (
        select jsonb_object_agg(m::text, coalesce(x.n, 0) order by m)
          from unnest(enum_range(null::svas.resultado_intento)) m
          left join (select resultado, count(*) n from i group by 1) x on x.resultado = m),
      'porCanal', (
        select jsonb_object_agg(m::text, coalesce(x.n, 0) order by m)
          from unnest(enum_range(null::svas.canal_contacto)) m
          left join (select canal, count(*) n from i group by 1) x on x.canal = m)))
    from t;
$$;

revoke all on function svas._validar_periodo(date, date) from public, anon, authenticated;
revoke all on function svas._reporte_retencion(date, date, uuid) from public, anon, authenticated;
revoke all on function svas._pct(numeric, numeric) from public, anon, authenticated;

-- ── GET /admin/reportes/ventas (RF-30) ──────────────────────────────────────
create or replace function svas.reporte_ventas(p_desde date, p_hasta date, p_agrupar text)
returns jsonb
language plpgsql
stable
security definer
set search_path = svas, public
as $$
declare
  v_res jsonb;
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);
  perform svas._validar_periodo(p_desde, p_hasta);
  if p_agrupar is null or p_agrupar not in ('canal', 'aseguradora', 'plan') then
    raise exception 'Agrupa por canal, aseguradora o plan';
  end if;

  with v as (
    select o.canal_venta::text                 as canal,
           o.contenido_plan ->> 'aseguradora'  as aseguradora,
           o.contenido_plan ->> 'plan'         as plan,
           o.contenido_plan ->> 'planId'       as plan_id,
           o.prima_anual, o.prima_final,
           pg.monto                            as cobrado,
           pg.modo
      from svas.poliza po
      join svas.orden_compra o on o.id = po.orden_compra_id
      join svas.pago pg        on pg.orden_compra_id = o.id and pg.estado = 'CONFIRMADO'
     where (po.fecha_emision at time zone 'America/Lima')::date between p_desde and p_hasta
  ),
  g as (
    select case p_agrupar when 'canal' then canal when 'aseguradora' then aseguradora else plan_id end as clave,
           case p_agrupar when 'canal' then canal when 'aseguradora' then aseguradora
                          else aseguradora || ' · ' || plan end                                       as etiqueta,
           count(*)                                   as polizas,
           count(*) filter (where modo = 'CUOTAS')    as en_cuotas,
           sum(prima_anual)                           as prima_anual,
           sum(prima_final)                           as prima_final,
           sum(cobrado)                               as cobrado,
           sum(sum(prima_final)) over ()              as total_final
      from v
     group by 1, 2
  )
  select jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta, 'agrupar', p_agrupar,
    'totales', (select jsonb_build_object(
                  'polizas',     count(*),
                  'enCuotas',    count(*) filter (where modo = 'CUOTAS'),
                  'primaAnual',  round(coalesce(sum(prima_anual), 0), 2)::text,
                  'descuentos',  round(coalesce(sum(prima_anual - prima_final), 0), 2)::text,
                  'primaFinal',  round(coalesce(sum(prima_final), 0), 2)::text,
                  'cobrado',     round(coalesce(sum(cobrado), 0), 2)::text,
                  'ticketPromedio', round(avg(prima_final), 2)::text)
                  from v),
    'grupos', coalesce((select jsonb_agg(jsonb_build_object(
                  'clave',         clave,
                  'etiqueta',      etiqueta,
                  'polizas',       polizas,
                  'enCuotas',      en_cuotas,
                  'primaAnual',    round(prima_anual, 2)::text,
                  'primaFinal',    round(prima_final, 2)::text,
                  'cobrado',       round(cobrado, 2)::text,
                  'ticketPromedio', round(prima_final / polizas, 2)::text,
                  'participacion', svas._pct(prima_final, total_final))
                  order by prima_final desc, etiqueta)
                  from g), '[]'::jsonb))
    into v_res;

  return v_res;
end;
$$;

-- ── GET /admin/reportes/retencion (OE3) ─────────────────────────────────────
create or replace function svas.reporte_retencion(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = svas, public
as $$
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);
  perform svas._validar_periodo(p_desde, p_hasta);
  return jsonb_build_object('desde', p_desde, 'hasta', p_hasta)
         || svas._reporte_retencion(p_desde, p_hasta, null);
end;
$$;

-- ── GET /admin/reportes/descuentos (RN-07, P5) ──────────────────────────────
create or replace function svas.reporte_descuentos(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = svas, public
as $$
declare
  v_res jsonb;
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);
  perform svas._validar_periodo(p_desde, p_hasta);

  with d as (
    select d.id, d.asesor_id, d.porcentaje, d.aceptado,
           coalesce(u.nombre_completo, 'Sin asesor') as asesor,
           c.ahorro
      from svas.descuento d
      left join svas.usuario u on u.id = d.asesor_id
      left join lateral (
        select o.prima_anual - o.prima_final as ahorro
          from svas.orden_compra o
          join svas.poliza po on po.orden_compra_id = o.id
         where o.descuento_id = d.id) c on true
     where d.tipo = 'NEGOCIADO'
       and (d.fecha at time zone 'America/Lima')::date between p_desde and p_hasta
  ),
  a as (
    select asesor_id, asesor,
           count(*)                                   as otorgados,
           count(*) filter (where aceptado)           as aceptados,
           count(ahorro)                              as convertidos,
           avg(porcentaje)                            as pct_promedio,
           max(porcentaje)                            as pct_maximo,
           sum(ahorro)                                as ahorro
      from d
     group by 1, 2
  ),
  pc as (
    select count(*) as aplicados, sum(o.prima_anual - o.prima_final) as ahorro
      from svas.orden_compra o
      join svas.poliza po on po.orden_compra_id = o.id
     where o.descuento_tipo = 'PRIMERA_COMPRA'
       and (po.fecha_emision at time zone 'America/Lima')::date between p_desde and p_hasta
  )
  select jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'negociados', (select jsonb_build_object(
                     'otorgados',         count(*),
                     'aceptados',         count(*) filter (where aceptado),
                     'convertidos',       count(ahorro),
                     'tasaConversion',    svas._pct(count(ahorro), count(*)),
                     'porcentajePromedio', round(avg(porcentaje), 2)::text,
                     'porcentajeMaximo',  max(porcentaje)::text,
                     'montoDescontado',   round(coalesce(sum(ahorro), 0), 2)::text)
                     from d),
    'porAsesor', coalesce((select jsonb_agg(jsonb_build_object(
                     'asesorId',          asesor_id,
                     'asesor',            asesor,
                     'otorgados',         otorgados,
                     'aceptados',         aceptados,
                     'convertidos',       convertidos,
                     'tasaConversion',    svas._pct(convertidos, otorgados),
                     'porcentajePromedio', round(pct_promedio, 2)::text,
                     'porcentajeMaximo',  pct_maximo::text,
                     'montoDescontado',   round(coalesce(ahorro, 0), 2)::text)
                     order by otorgados desc, asesor)
                     from a), '[]'::jsonb),
    'primeraCompra', (select jsonb_build_object(
                     'aplicados',       aplicados,
                     'montoDescontado', round(coalesce(ahorro, 0), 2)::text)
                     from pc))
    into v_res;

  return v_res;
end;
$$;

-- ── ★ GET /admin/reportes/prueba-choque (§16.7) ─────────────────────────────
create or replace function svas.reporte_prueba_choque(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = svas, public
as $$
declare
  v_res jsonb;
begin
  perform svas.exigir_rol(array['ADMINISTRADOR']);
  perform svas._validar_periodo(p_desde, p_hasta);

  with c as (
    select co.id, co.estado, v.uso::text as segmento,
           (select s.id from svas.simulacion s
             where s.cotizacion_id = co.id
             order by s.fecha desc limit 1) as sim_id
      from svas.cotizacion co
      join svas.vehiculo v on v.id = co.vehiculo_id
     where (co.fecha at time zone 'America/Lima')::date between p_desde and p_hasta
  ),
  compras as (
    select c.id, pc.id as prima_id, pc.prima,
           (select min(p2.prima) from svas.prima_cotizada p2
             where p2.cotizacion_id = c.id and p2.disponible) as minima,
           (select sp.prima_cotizada_id from svas.simulacion_plan sp
             where sp.simulacion_id = c.sim_id and sp.ranking = 1 limit 1) as primero
      from c
      join svas.orden_compra o   on o.cotizacion_id = c.id
      join svas.poliza po        on po.orden_compra_id = o.id
      join svas.prima_cotizada pc on pc.id = o.prima_cotizada_id
     where c.sim_id is not null
  ),
  prefs as (
    select c.segmento, s.zona::text as zona, p.codigo, count(*) as veces
      from c
      join svas.simulacion s on s.id = c.sim_id
      cross join lateral jsonb_array_elements_text(
        case when jsonb_typeof(s.perfil -> 'preocupaciones') = 'array'
             then s.perfil -> 'preocupaciones' else '[]'::jsonb end) p(codigo)
     group by 1, 2, 3
  ),
  grupos as (
    select c.segmento, s.zona::text as zona, count(*) as simulaciones
      from c
      join svas.simulacion s on s.id = c.sim_id
     group by 1, 2
  )
  select jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'cotizaciones', (select count(*) from c),
    'conSimulacion', (select count(*) from c where sim_id is not null),
    'porcentajeConSimulacion', (select svas._pct(count(*) filter (where sim_id is not null), count(*)) from c),
    'conversion', (select jsonb_build_object(
        'conSimulacion', jsonb_build_object(
          'cotizaciones', count(*) filter (where sim_id is not null),
          'compras',      count(*) filter (where sim_id is not null and estado = 'CONVERTIDA'),
          'tasa',         svas._pct(count(*) filter (where sim_id is not null and estado = 'CONVERTIDA'),
                                    count(*) filter (where sim_id is not null))),
        'sinSimulacion', jsonb_build_object(
          'cotizaciones', count(*) filter (where sim_id is null),
          'compras',      count(*) filter (where sim_id is null and estado = 'CONVERTIDA'),
          'tasa',         svas._pct(count(*) filter (where sim_id is null and estado = 'CONVERTIDA'),
                                    count(*) filter (where sim_id is null))))
        from c),
    'comprasTrasSimular', (select jsonb_build_object(
        'compras',                count(*),
        'planDistintoAlMasBarato', count(*) filter (where prima > minima),
        'porcentajeDistinto',     svas._pct(count(*) filter (where prima > minima), count(*)),
        'eligieronElPrimero',     count(*) filter (where prima_id = primero),
        'porcentajePrimero',      svas._pct(count(*) filter (where prima_id = primero), count(*)))
        from compras),
    'preocupaciones', coalesce((select jsonb_agg(jsonb_build_object(
        'segmento',     g.segmento,
        'zona',         g.zona,
        'simulaciones', g.simulaciones,
        'masElegido',   (select jsonb_build_object('codigo', p.codigo,
                                                   'nombre', coalesce(e.nombre, p.codigo),
                                                   'veces', p.veces)
                           from prefs p
                           left join svas.escenario_siniestro e on e.codigo = p.codigo
                          where p.segmento = g.segmento and p.zona = g.zona
                          order by p.veces desc, p.codigo limit 1),
        'escenarios',   coalesce((select jsonb_agg(jsonb_build_object(
                                     'codigo', p.codigo,
                                     'nombre', coalesce(e.nombre, p.codigo),
                                     'veces',  p.veces) order by p.veces desc, p.codigo)
                           from prefs p
                           left join svas.escenario_siniestro e on e.codigo = p.codigo
                          where p.segmento = g.segmento and p.zona = g.zona), '[]'::jsonb))
        order by g.segmento, g.zona)
        from grupos g), '[]'::jsonb),
    -- §16.7 último punto: requiere el mensaje final con el resumen RN-35 (pendiente, Ola 4).
    'conversionMensajeRn35', null)
    into v_res;

  return v_res;
end;
$$;

-- ── GET /asesor/reportes/mi-desempeno ───────────────────────────────────────
create or replace function svas.reporte_mi_desempeno(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = svas, public
as $$
declare
  v_yo  uuid := auth.uid();
  v_res jsonb;
begin
  perform svas.exigir_rol(array['ASESOR']);
  perform svas._validar_periodo(p_desde, p_hasta);

  with sa as (
    select * from svas.solicitud_asesoria
     where asesor_id = v_yo
       and (fecha_creacion at time zone 'America/Lima')::date between p_desde and p_hasta
  ),
  d as (
    select d.id, d.porcentaje, d.aceptado,
           exists (select 1 from svas.orden_compra o
                     join svas.poliza po on po.orden_compra_id = o.id
                    where o.descuento_id = d.id) as convertido
      from svas.descuento d
     where d.asesor_id = v_yo and d.tipo = 'NEGOCIADO'
       and (d.fecha at time zone 'America/Lima')::date between p_desde and p_hasta
  ),
  ventas as (
    select o.canal_venta, o.prima_final
      from svas.poliza po
      join svas.orden_compra o on o.id = po.orden_compra_id
      left join svas.descuento d on d.id = o.descuento_id
     where (po.fecha_emision at time zone 'America/Lima')::date between p_desde and p_hasta
       and ((o.descuento_tipo = 'NEGOCIADO' and d.asesor_id = v_yo)
            or (o.canal_venta = 'TELEMARKETING'
                and exists (select 1
                              from svas.seguimiento sg
                              join svas.intento_contacto i on i.seguimiento_id = sg.id
                             where sg.cotizacion_id = o.cotizacion_id
                               and i.asesor_id = v_yo and i.resultado = 'ACEPTA')))
  )
  select jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'asesorias', (select jsonb_build_object(
        'atendidas',  count(*),
        'cerradas',   count(*) filter (where estado = 'CERRADA'),
        'enAtencion', count(*) filter (where estado = 'EN_ATENCION'),
        'porMotivo',  (select jsonb_object_agg(m::text, coalesce(x.n, 0) order by m)
                         from unnest(enum_range(null::svas.motivo_asesoria)) m
                         left join (select motivo, count(*) n from sa group by 1) x on x.motivo = m))
        from sa),
    'retencion', svas._reporte_retencion(p_desde, p_hasta, v_yo),
    'descuentos', (select jsonb_build_object(
        'otorgados',          count(*),
        'aceptados',          count(*) filter (where aceptado),
        'convertidos',        count(*) filter (where convertido),
        'tasaConversion',     svas._pct(count(*) filter (where convertido), count(*)),
        'porcentajePromedio', round(avg(porcentaje), 2)::text)
        from d),
    'ventasAtribuidas', (select jsonb_build_object(
        'polizas',       count(*),
        'porAsesoria',   count(*) filter (where canal_venta = 'ASESORIA'),
        'porTelemarketing', count(*) filter (where canal_venta = 'TELEMARKETING'),
        'primaFinal',    round(coalesce(sum(prima_final), 0), 2)::text)
        from ventas))
    into v_res;

  return v_res;
end;
$$;

-- ── Permisos ────────────────────────────────────────────────────────────────
revoke all on function svas.reporte_ventas(date, date, text) from public, anon;
revoke all on function svas.reporte_retencion(date, date) from public, anon;
revoke all on function svas.reporte_descuentos(date, date) from public, anon;
revoke all on function svas.reporte_prueba_choque(date, date) from public, anon;
revoke all on function svas.reporte_mi_desempeno(date, date) from public, anon;
grant execute on function svas.reporte_ventas(date, date, text) to authenticated;
grant execute on function svas.reporte_retencion(date, date) to authenticated;
grant execute on function svas.reporte_descuentos(date, date) to authenticated;
grant execute on function svas.reporte_prueba_choque(date, date) to authenticated;
grant execute on function svas.reporte_mi_desempeno(date, date) to authenticated;

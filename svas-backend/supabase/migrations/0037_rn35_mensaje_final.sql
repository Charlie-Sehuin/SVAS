-- 0037 · RN-35 medible (Ola 4, tanda 2)
--   · seguimiento guarda cuándo salió el mensaje final y si llevó la frase de
--     contraste de la Prueba de Choque (RN-35).
--   · registrar_mensaje_final: lo llama el backend (service_role) cuando el
--     notificador confirma el envío.
--   · reporte_prueba_choque v2: llena conversionMensajeRn35 (§16.7, último punto).
-- Fuente: contexto §5 (RN-12, RN-35), §8.5, §16.7; 0024, 0025, 0036.
--
-- Errores: P0002 → 404 · 42501 → 403.
--
-- Ajustes propios (revisables):
--   · "Convirtió" = la cotización terminó CONVERTIDA (por la retoma o después).
--   · Solo cuentan los mensajes que el notificador confirmó como enviados.
--   · Repetir el registro reemplaza los valores (último envío).

-- ── seguimiento ─────────────────────────────────────────────────────────────
alter table svas.seguimiento
  add column mensaje_final_en   timestamptz null,
  add column mensaje_final_rn35 boolean     null,
  add constraint ck_seguimiento_mensaje_final
    check ((mensaje_final_en is null) = (mensaje_final_rn35 is null));

comment on column svas.seguimiento.mensaje_final_rn35 is
  'true si el mensaje final llevó la frase de contraste de la Prueba de Choque (RN-35)';

-- ── registrar_mensaje_final (service_role) ──────────────────────────────────
create or replace function svas.registrar_mensaje_final(
  p_seguimiento_id uuid,
  p_incluye_rn35   boolean
)
returns void
language plpgsql
security definer
set search_path = svas, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'No tienes permiso para realizar esta acción' using errcode = '42501';
  end if;
  if p_incluye_rn35 is null then
    raise exception 'Indica si el mensaje llevó el resumen de la Prueba de Choque';
  end if;

  update svas.seguimiento
     set mensaje_final_en = now(), mensaje_final_rn35 = p_incluye_rn35
   where id = p_seguimiento_id;
  if not found then
    raise exception 'El seguimiento no existe' using errcode = 'P0002';
  end if;

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (null, 'MENSAJE_FINAL', 'seguimiento', p_seguimiento_id,
          jsonb_build_object('rn35', p_incluye_rn35));
end;
$$;

revoke all on function svas.registrar_mensaje_final(uuid, boolean) from public, anon, authenticated;
grant execute on function svas.registrar_mensaje_final(uuid, boolean) to service_role;

-- ── ★ reporte_prueba_choque v2 (reemplaza la de 0036) ───────────────────────
-- Único cambio: conversionMensajeRn35 deja de ser null.
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
    -- §16.7 último punto: seguimientos de la cohorte cuyo mensaje final salió, con o sin RN-35.
    'conversionMensajeRn35', (select jsonb_build_object(
        'conRn35', jsonb_build_object(
          'mensajes',  count(*) filter (where sg.mensaje_final_rn35),
          'compras',   count(*) filter (where sg.mensaje_final_rn35 and c.estado = 'CONVERTIDA'),
          'tasa',      svas._pct(count(*) filter (where sg.mensaje_final_rn35 and c.estado = 'CONVERTIDA'),
                                 count(*) filter (where sg.mensaje_final_rn35))),
        'sinRn35', jsonb_build_object(
          'mensajes',  count(*) filter (where not sg.mensaje_final_rn35),
          'compras',   count(*) filter (where not sg.mensaje_final_rn35 and c.estado = 'CONVERTIDA'),
          'tasa',      svas._pct(count(*) filter (where not sg.mensaje_final_rn35 and c.estado = 'CONVERTIDA'),
                                 count(*) filter (where not sg.mensaje_final_rn35))))
        from c
        join svas.seguimiento sg on sg.cotizacion_id = c.id
       where sg.mensaje_final_en is not null))
    into v_res;

  return v_res;
end;
$$;

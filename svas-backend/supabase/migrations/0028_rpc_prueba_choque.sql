-- 0028 · RPC 6.2 registrar_simulacion + 6.13 actualizar_suma_asegurada con
--        simulacion.vigente (RN-37)
-- Fuente: contexto §6.2, §6.13, §13.1, §13.6, §16.3. El doc ubica 6.2 en 0012.
--
-- El cálculo lo hace el dominio prueba-choque (función pura en TypeScript);
-- este RPC solo valida pertenencia y guarda la instantánea (RN-32) en una
-- transacción.

-- ── 6.2 registrar_simulacion ────────────────────────────────────────────────
-- p_payload: {
--   "perfil": { estacionaCochera, kmMesAlto, usoNocturno, ingresoDiarioSoles, preocupaciones[] },
--   "zona": "ALTA|MEDIA|BAJA", "version_reglas": "abc123",
--   "planes": [{ prima_cotizada_id, costo_real_anual, peor_caso, ranking, datos_completos }],
--   "resultados": [{ prima_cotizada_id, escenario_id, sin_dato, cubre, probabilidad_usada,
--                    monto_dano_usado, monto_cubierto, deducible_aplicado, no_cubierto,
--                    ingreso_perdido, desembolso_cliente }]
-- }
-- Rol: service_role (flujo con X-Cotizacion-Token, ya validado) o CLIENTE dueño.
create or replace function svas.registrar_simulacion(p_cotizacion_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_estado     svas.estado_cotizacion;
  v_esperadas  int;
  v_planes     int;
  v_validas    int;
  v_resultados int;
  v_res_ok     int;
  v_sim        svas.simulacion;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    perform svas.exigir_rol(array['CLIENTE']);
    if not svas.es_duenio_cotizacion(p_cotizacion_id) then
      raise exception 'No tienes permiso para simular esta cotización' using errcode = '42501';
    end if;
  end if;

  select estado into v_estado from svas.cotizacion where id = p_cotizacion_id for update;
  if not found then
    raise exception 'La cotización no existe' using errcode = 'P0002';
  end if;
  -- §13.1: solo REGISTRADA simula; NO_CONCRETADA es de lectura; CONVERTIDA bloquea.
  if v_estado <> 'REGISTRADA' then
    raise exception 'Esta cotización ya no se puede simular';
  end if;

  if jsonb_typeof(p_payload -> 'perfil') is distinct from 'object'
     or jsonb_typeof(p_payload -> 'planes') is distinct from 'array'
     or jsonb_typeof(p_payload -> 'resultados') is distinct from 'array'
     or coalesce(p_payload ->> 'version_reglas', '') = '' then
    raise exception 'La simulación llegó incompleta';
  end if;

  -- Cada plan con prima disponible, una sola vez y de ESTA cotización (§6.2).
  select count(*) into v_esperadas
    from svas.prima_cotizada where cotizacion_id = p_cotizacion_id and disponible;
  select count(*), count(distinct pc.id)
    into v_planes, v_validas
    from jsonb_array_elements(p_payload -> 'planes') e
    left join svas.prima_cotizada pc on pc.id = (e ->> 'prima_cotizada_id')::uuid
                                    and pc.cotizacion_id = p_cotizacion_id
                                    and pc.disponible;
  if v_esperadas = 0 then
    raise exception 'La cotización no tiene primas para simular';
  end if;
  if v_planes <> v_esperadas or v_validas <> v_esperadas then
    raise exception 'La simulación no corresponde a las primas de esta cotización';
  end if;

  select count(*), count(pc.id) filter (where es.id is not null)
    into v_resultados, v_res_ok
    from jsonb_array_elements(p_payload -> 'resultados') e
    left join svas.prima_cotizada pc on pc.id = (e ->> 'prima_cotizada_id')::uuid
                                    and pc.cotizacion_id = p_cotizacion_id
    left join svas.escenario_siniestro es on es.id = (e ->> 'escenario_id')::uuid;
  if v_resultados = 0 or v_res_ok <> v_resultados then
    raise exception 'La simulación no corresponde a las primas de esta cotización';
  end if;

  insert into svas.simulacion (cotizacion_id, perfil, zona, version_reglas)
  values (p_cotizacion_id, p_payload -> 'perfil', (p_payload ->> 'zona')::svas.zona_riesgo,
          left(p_payload ->> 'version_reglas', 20))
  returning * into v_sim;

  insert into svas.simulacion_plan
    (simulacion_id, prima_cotizada_id, costo_real_anual, peor_caso, ranking, datos_completos)
  select v_sim.id, x.prima_cotizada_id, x.costo_real_anual, x.peor_caso, x.ranking, x.datos_completos
    from jsonb_to_recordset(p_payload -> 'planes') as x(
           prima_cotizada_id uuid, costo_real_anual numeric, peor_caso numeric,
           ranking smallint, datos_completos boolean);

  insert into svas.simulacion_resultado
    (simulacion_id, prima_cotizada_id, escenario_id, sin_dato, cubre, probabilidad_usada,
     monto_dano_usado, monto_cubierto, deducible_aplicado, no_cubierto, ingreso_perdido,
     desembolso_cliente)
  select v_sim.id, x.prima_cotizada_id, x.escenario_id, coalesce(x.sin_dato, false), x.cubre,
         x.probabilidad_usada, x.monto_dano_usado, x.monto_cubierto, x.deducible_aplicado,
         x.no_cubierto, x.ingreso_perdido, x.desembolso_cliente
    from jsonb_to_recordset(p_payload -> 'resultados') as x(
           prima_cotizada_id uuid, escenario_id uuid, sin_dato boolean, cubre boolean,
           probabilidad_usada numeric, monto_dano_usado numeric, monto_cubierto numeric,
           deducible_aplicado numeric, no_cubierto numeric, ingreso_perdido numeric,
           desembolso_cliente numeric);

  -- El perfil no va a la bitácora (RN-36).
  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'SIMULAR', 'simulacion', v_sim.id,
          jsonb_build_object('cotizacion_id', p_cotizacion_id, 'zona', v_sim.zona,
                             'version_reglas', v_sim.version_reglas));

  return jsonb_build_object('simulacion_id', v_sim.id, 'fecha', v_sim.fecha);
end;
$$;

revoke all on function svas.registrar_simulacion(uuid, jsonb) from public, anon;
grant execute on function svas.registrar_simulacion(uuid, jsonb) to authenticated, service_role;

-- ── 6.13 actualizar_suma_asegurada (reemplaza la de 0012) ───────────────────
-- Único cambio: al ajustar la suma, las simulaciones vigentes de la
-- cotización pasan a vigente = false y se devuelve cuántas (RN-37, §13.6).
-- El resto es idéntico a 0012.
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
    raise exception 'Ya iniciaste tu compra: la suma asegurada ya no se puede cambiar.';
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

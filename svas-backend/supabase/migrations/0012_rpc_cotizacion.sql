-- 0012 · RPCs de cotización: 6.1 registrar_cotizacion, 6.13 actualizar_suma_asegurada,
--        vincular_cliente (PATCH /cotizaciones/:id/cliente) y
--        registrar_usuario_cliente (POST /auth/registro: usuario + cliente atómicos)
-- Fuente: contexto §6.1, §6.13, §5 (RN-01..04, RN-37..41), §8.1; backend §4.4.
--
-- Diferidos (dependen de tablas que aún no existen):
--   · 6.2 registrar_simulacion → con 0011 (prueba de choque).
--   · 6.13: "rechaza si ya existe orden_compra" y "simulacion.vigente = false"
--     → se agregan con create or replace cuando existan 0010/0011. Mientras
--     tanto devuelve simulaciones_invalidadas = 0.
--
-- Los RPC NO calculan primas (RN-40): reciben lo que calcularon las Estrategias
-- en TypeScript y vuelven a validar RN-37 (defensa en profundidad).
-- Montos devueltos como texto ('640.40'), nunca como número JSON.

-- ── Utilidad: monto con separador de miles para mensajes ────────────────────
create or replace function svas.fmt_usd(p numeric)
returns text
language sql
immutable
set search_path = svas, public
as $$
  select 'USD ' || to_char(p, 'FM999,999,990.00');
$$;

revoke execute on function svas.fmt_usd(numeric) from public, anon;

-- ── 6.1 registrar_cotizacion ────────────────────────────────────────────────
-- p_payload:
-- {
--   "contacto": { "nombres", "apellidos", "telefono", "email", "canal_preferido" },
--   "vehiculo": { "uso", "modelo_id", "anio", "clase"?, "placa"?, "ubigeo" },
--   "token_acceso_hash": "<sha256 hex>",
--   "opciones": ["COMPRA_INMEDIATA", "ASESORIA"],
--   "motivo_derivacion": null | "INSPECCION" | "NO_ASEGURABLE",
--   "primas": [{ "plan_id", "disponible", "suma_asegurada", "prima", "prima_mensual",
--                "detalle_calculo", "motivo_no_disponible" }]
-- }
create or replace function svas.registrar_cotizacion(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_contacto      jsonb := p_payload -> 'contacto';
  v_veh           jsonb := p_payload -> 'vehiculo';
  v_motivo        svas.motivo_asesoria;
  v_opciones      svas.opcion_venta[];
  v_anio          smallint;
  v_modelo        record;
  v_cliente       svas.cliente;
  v_vehiculo_id   uuid;
  v_cotizacion_id uuid;
  v_fecha         timestamptz;
  v_prima         jsonb;
  v_plan          record;
  v_rango         record;
  v_disponible    boolean;
  v_suma          numeric;
  v_disponibles   int := 0;
begin
  -- ── Forma del payload ──
  if p_payload is null
     or jsonb_typeof(v_contacto) is distinct from 'object'
     or jsonb_typeof(v_veh) is distinct from 'object' then
    raise exception 'Faltan los datos de contacto o del vehículo';
  end if;

  if coalesce(p_payload ->> 'token_acceso_hash', '') !~ '^[0-9a-f]{64}$' then
    raise exception 'El token de acceso de la cotización no es válido';
  end if;

  if nullif(btrim(v_contacto ->> 'nombres'), '') is null
     or nullif(btrim(v_contacto ->> 'apellidos'), '') is null
     or nullif(v_contacto ->> 'telefono', '') is null
     or nullif(btrim(v_contacto ->> 'email'), '') is null then
    raise exception 'Faltan los datos de contacto (nombres, apellidos, teléfono y email)';
  end if;

  if nullif(v_veh ->> 'uso', '') is null
     or nullif(v_veh ->> 'modelo_id', '') is null
     or nullif(v_veh ->> 'anio', '') is null
     or nullif(v_veh ->> 'ubigeo', '') is null then
    raise exception 'Faltan datos del vehículo (uso, modelo, año y distrito)';
  end if;

  if jsonb_typeof(p_payload -> 'primas') is distinct from 'array'
     or jsonb_array_length(p_payload -> 'primas') = 0 then
    raise exception 'La cotización debe incluir las primas calculadas';
  end if;

  -- ── Derivación (RN-01..04, decidida por el dominio) ──
  v_motivo := nullif(p_payload ->> 'motivo_derivacion', '')::svas.motivo_asesoria;

  select coalesce(array_agg(distinct o::svas.opcion_venta), '{}')
    into v_opciones
    from jsonb_array_elements_text(coalesce(p_payload -> 'opciones', '[]'::jsonb)) o;

  if cardinality(v_opciones) = 0 then
    raise exception 'La cotización debe tener al menos una opción de venta';
  end if;

  if v_motivo is not null and v_motivo not in ('INSPECCION', 'NO_ASEGURABLE') then
    raise exception 'Al cotizar solo se deriva por INSPECCION o NO_ASEGURABLE';
  end if;

  if v_motivo is not null and v_opciones <> array['ASESORIA']::svas.opcion_venta[] then
    raise exception 'Una cotización derivada a un asesor solo admite la opción ASESORIA';
  end if;

  -- ── Vehículo ──
  v_anio := (v_veh ->> 'anio')::smallint;

  select m.id, t.nombre as tipo
    into v_modelo
    from svas.modelo m
    join svas.marca ma        on ma.id = m.marca_id
    join svas.tipo_vehiculo t on t.id = m.tipo_id
   where m.id = (v_veh ->> 'modelo_id')::uuid
     and m.activo
     and ma.activa;

  if not found then
    raise exception 'El modelo del vehículo no existe o no está disponible';
  end if;

  if not exists (select 1 from svas.ubigeo u where u.codigo = v_veh ->> 'ubigeo') then
    raise exception 'El distrito no existe';
  end if;

  -- ── Cliente: sin cuenta se busca por email + teléfono (6.1) ──
  -- Nunca se engancha a un cliente que ya tiene cuenta: eso lo hace vincular_cliente con JWT.
  select c.*
    into v_cliente
    from svas.cliente c
   where c.usuario_id is null
     and lower(c.email) = lower(btrim(v_contacto ->> 'email'))
     and c.telefono = v_contacto ->> 'telefono'
   order by c.creado_en
   limit 1
   for update;

  if not found then
    insert into svas.cliente (nombres, apellidos, telefono, email, canal_preferido)
    values (btrim(v_contacto ->> 'nombres'),
            btrim(v_contacto ->> 'apellidos'),
            v_contacto ->> 'telefono',
            lower(btrim(v_contacto ->> 'email')),
            coalesce(nullif(v_contacto ->> 'canal_preferido', '')::svas.canal_contacto, 'WHATSAPP'))
    returning * into v_cliente;
  elsif nullif(v_contacto ->> 'canal_preferido', '') is not null then
    update svas.cliente
       set canal_preferido = (v_contacto ->> 'canal_preferido')::svas.canal_contacto
     where id = v_cliente.id
    returning * into v_cliente;
  end if;

  insert into svas.vehiculo (cliente_id, uso, modelo_id, anio, clase, tipo, placa)
  values (v_cliente.id,
          (v_veh ->> 'uso')::svas.uso_vehiculo,
          v_modelo.id,
          v_anio,
          nullif(btrim(v_veh ->> 'clase'), ''),
          v_modelo.tipo,
          nullif(upper(btrim(v_veh ->> 'placa')), ''))
  returning id into v_vehiculo_id;

  insert into svas.ubicacion_uso (vehiculo_id, ubigeo)
  values (v_vehiculo_id, v_veh ->> 'ubigeo');

  -- ── Cotización + opciones ──
  insert into svas.cotizacion (vehiculo_id, motivo_derivacion, token_acceso_hash)
  values (v_vehiculo_id, v_motivo, p_payload ->> 'token_acceso_hash')
  returning id, fecha into v_cotizacion_id, v_fecha;

  insert into svas.cotizacion_opcion (cotizacion_id, opcion)
  select v_cotizacion_id, unnest(v_opciones);

  -- ── Primas (calculadas por las Estrategias) ──
  for v_prima in select * from jsonb_array_elements(p_payload -> 'primas') loop
    select p.id, p.aseguradora_id, a.nombre as aseguradora
      into v_plan
      from svas.plan p
      join svas.aseguradora a on a.id = p.aseguradora_id
     where p.id = (v_prima ->> 'plan_id')::uuid
       and p.activo
       and a.activa;

    if not found then
      raise exception 'Uno de los planes cotizados no existe o no está activo';
    end if;

    v_disponible := coalesce((v_prima ->> 'disponible')::boolean, false);
    v_suma := null;

    if v_disponible then
      v_suma := (v_prima ->> 'suma_asegurada')::numeric;

      select r.suma_minima, r.suma_maxima
        into v_rango
        from svas.rango_suma_asegurada r
       where r.aseguradora_id = v_plan.aseguradora_id
         and r.modelo_id = v_modelo.id
         and r.anio = v_anio;

      if not found then
        raise exception '% no tiene rango de suma asegurada para este vehículo', v_plan.aseguradora;
      end if;

      -- RN-37 (defensa en profundidad)
      if v_suma is null or v_suma < v_rango.suma_minima or v_suma > v_rango.suma_maxima then
        raise exception 'La suma asegurada de % debe estar entre % y %',
          v_plan.aseguradora, svas.fmt_usd(v_rango.suma_minima), svas.fmt_usd(v_rango.suma_maxima);
      end if;

      v_disponibles := v_disponibles + 1;
    end if;

    insert into svas.prima_cotizada (
      cotizacion_id, plan_id, suma_asegurada, prima, prima_mensual,
      detalle_calculo, motivo_no_disponible, disponible)
    values (
      v_cotizacion_id,
      v_plan.id,
      v_suma,
      case when v_disponible then (v_prima ->> 'prima')::numeric end,
      case when v_disponible then (v_prima ->> 'prima_mensual')::numeric end,
      case when v_disponible and jsonb_typeof(v_prima -> 'detalle_calculo') = 'object'
           then v_prima -> 'detalle_calculo' end,
      case when not v_disponible then nullif(v_prima ->> 'motivo_no_disponible', '') end,
      v_disponible);
  end loop;

  -- RN-37: los planes de una misma aseguradora comparten la suma.
  if exists (
    select 1
      from svas.prima_cotizada pc
      join svas.plan p on p.id = pc.plan_id
     where pc.cotizacion_id = v_cotizacion_id
       and pc.disponible
     group by p.aseguradora_id
    having count(distinct pc.suma_asegurada) > 1
  ) then
    raise exception 'Los planes de una misma aseguradora deben tener la misma suma asegurada';
  end if;

  -- RN-04: sin ninguna prima disponible solo queda el asesor.
  if v_disponibles = 0 and v_motivo is null then
    raise exception 'Ninguna aseguradora pudo cotizar: la cotización debe derivarse a un asesor';
  end if;
  if v_motivo = 'NO_ASEGURABLE' and v_disponibles > 0 then
    raise exception 'Una cotización con primas disponibles no puede marcarse como no asegurable';
  end if;

  -- ── Solicitud del sistema (RN-03 / RN-04) ──
  if v_motivo is not null then
    insert into svas.solicitud_asesoria (cotizacion_id, motivo, canal, origen)
    values (v_cotizacion_id, v_motivo, v_cliente.canal_preferido, 'SISTEMA');
  end if;

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (null, 'COTIZAR', 'cotizacion', v_cotizacion_id,
          jsonb_build_object('primas_disponibles', v_disponibles,
                             'motivo_derivacion', v_motivo,
                             'opciones', to_jsonb(v_opciones)));

  return jsonb_build_object(
    'cotizacion_id', v_cotizacion_id,
    'cliente_id', v_cliente.id,
    'fecha', v_fecha,
    'estado', 'REGISTRADA',
    'motivo_derivacion', v_motivo,
    'opciones', to_jsonb(v_opciones),
    'primas', (select jsonb_agg(jsonb_build_object('id', pc.id, 'plan_id', pc.plan_id))
                 from svas.prima_cotizada pc
                where pc.cotizacion_id = v_cotizacion_id));
end;
$$;

-- ── 6.13 actualizar_suma_asegurada ──────────────────────────────────────────
-- p_primas: [{ "plan_id", "disponible": true, "suma_asegurada", "prima",
--              "prima_mensual", "detalle_calculo" }]  (todos los planes de esa aseguradora)
-- Rol: service_role (flujo con X-Cotizacion-Token, ya validado por el backend)
--      o CLIENTE dueño de la cotización.
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

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'AJUSTAR_SUMA', 'cotizacion', p_cotizacion_id,
          jsonb_build_object('aseguradora_id', p_aseguradora_id,
                             'antes', v_antes,
                             'despues', v_suma));

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
    'simulaciones_invalidadas', 0);
end;
$$;

-- ── vincular_cliente ────────────────────────────────────────────────────────
-- Crea o actualiza la ficha `cliente` de una cuenta CLIENTE y, si llega
-- p_cotizacion_id, le vincula esa cotización (backend §4.4).
-- Rol: service_role. El backend ya verificó el JWT del usuario. Si la
-- cotización aún no es suya, exige p_token_hash = sha256(X-Cotizacion-Token):
-- solo quien recibió el token puede llevarse una cotización anónima.
-- p_contacto: { "nombres"?, "apellidos"?, "telefono"?, "canal_preferido"? }
create or replace function svas.vincular_cliente(
  p_usuario_id uuid,
  p_contacto jsonb,
  p_cotizacion_id uuid default null,
  p_token_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_usuario     svas.usuario;
  v_cliente     svas.cliente;
  v_cot_cliente svas.cliente;
  v_vehiculo_id uuid;
  v_token_hash  text;
  v_contacto    jsonb := coalesce(p_contacto, '{}'::jsonb);
begin
  select * into v_usuario from svas.usuario u where u.id = p_usuario_id and u.activo;
  if not found then
    raise exception 'El usuario no existe o está desactivado' using errcode = 'P0002';
  end if;
  if v_usuario.rol <> 'CLIENTE' then
    raise exception 'Solo una cuenta de cliente puede tener cotizaciones';
  end if;

  select * into v_cliente from svas.cliente c where c.usuario_id = p_usuario_id for update;

  if p_cotizacion_id is not null then
    select co.vehiculo_id, co.token_acceso_hash into v_vehiculo_id, v_token_hash
      from svas.cotizacion co
     where co.id = p_cotizacion_id
       for update;
    if not found then
      raise exception 'La cotización no existe' using errcode = 'P0002';
    end if;

    select c.* into v_cot_cliente
      from svas.cliente c
      join svas.vehiculo v on v.cliente_id = c.id
     where v.id = v_vehiculo_id
       for update of c;

    if v_cot_cliente.usuario_id is not null and v_cot_cliente.usuario_id <> p_usuario_id then
      raise exception 'Esta cotización pertenece a otra cuenta' using errcode = '42501';
    end if;

    if v_cot_cliente.usuario_id is null and p_token_hash is distinct from v_token_hash then
      raise exception 'Necesitas el enlace de tu cotización para vincularla a tu cuenta'
        using errcode = '42501';
    end if;

    if v_cliente.id is null then
      -- La ficha anónima pasa a ser la del usuario.
      update svas.cliente set usuario_id = p_usuario_id
       where id = v_cot_cliente.id
      returning * into v_cliente;
    elsif v_cliente.id <> v_cot_cliente.id then
      -- El usuario ya tenía ficha: el vehículo de la cotización pasa a ella.
      update svas.vehiculo set cliente_id = v_cliente.id where id = v_vehiculo_id;
    end if;
  end if;

  if v_cliente.id is null then
    if nullif(btrim(v_contacto ->> 'nombres'), '') is null
       or nullif(btrim(v_contacto ->> 'apellidos'), '') is null
       or nullif(v_contacto ->> 'telefono', '') is null then
      raise exception 'Faltan los datos de contacto (nombres, apellidos y teléfono)';
    end if;

    insert into svas.cliente (usuario_id, nombres, apellidos, telefono, email, canal_preferido)
    values (p_usuario_id,
            btrim(v_contacto ->> 'nombres'),
            btrim(v_contacto ->> 'apellidos'),
            v_contacto ->> 'telefono',
            v_usuario.email,
            coalesce(nullif(v_contacto ->> 'canal_preferido', '')::svas.canal_contacto, 'WHATSAPP'))
    returning * into v_cliente;
  else
    update svas.cliente
       set nombres         = coalesce(nullif(btrim(v_contacto ->> 'nombres'), ''), nombres),
           apellidos       = coalesce(nullif(btrim(v_contacto ->> 'apellidos'), ''), apellidos),
           telefono        = coalesce(nullif(v_contacto ->> 'telefono', ''), telefono),
           canal_preferido = coalesce(nullif(v_contacto ->> 'canal_preferido', '')::svas.canal_contacto,
                                      canal_preferido),
           email           = v_usuario.email
     where id = v_cliente.id
    returning * into v_cliente;
  end if;

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (p_usuario_id,
          case when p_cotizacion_id is null then 'GUARDAR_CLIENTE' else 'VINCULAR_COTIZACION' end,
          'cliente', v_cliente.id,
          jsonb_build_object('cotizacion_id', p_cotizacion_id));

  return jsonb_build_object('cliente_id', v_cliente.id, 'cotizacion_id', p_cotizacion_id);
end;
$$;

-- ── registrar_usuario_cliente ───────────────────────────────────────────────
-- POST /auth/registro: perfil CLIENTE + ficha cliente (+ cotización anónima si
-- llega con su token) en UNA transacción. Si algo falla no queda nada en svas
-- y el backend borra la cuenta de Auth (compensación ya existente).
-- Rol: service_role.
create or replace function svas.registrar_usuario_cliente(
  p_usuario_id uuid,
  p_email text,
  p_nombre_completo text,
  p_contacto jsonb,
  p_cotizacion_id uuid default null,
  p_token_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_usuario svas.usuario;
begin
  insert into svas.usuario (id, email, rol, nombre_completo, activo)
  values (p_usuario_id, lower(btrim(p_email)), 'CLIENTE', btrim(p_nombre_completo), true)
  returning * into v_usuario;

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id)
  values (p_usuario_id, 'REGISTRO_CLIENTE', 'usuario', p_usuario_id);

  perform svas.vincular_cliente(p_usuario_id, p_contacto, p_cotizacion_id, p_token_hash);

  return jsonb_build_object(
    'id', v_usuario.id,
    'email', v_usuario.email,
    'rol', v_usuario.rol,
    'nombre_completo', v_usuario.nombre_completo,
    'activo', v_usuario.activo);
end;
$$;

-- ── Permisos ────────────────────────────────────────────────────────────────
revoke all on function svas.registrar_cotizacion(jsonb) from public, anon, authenticated;
revoke all on function svas.actualizar_suma_asegurada(uuid, uuid, jsonb) from public, anon;
revoke all on function svas.vincular_cliente(uuid, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function svas.registrar_usuario_cliente(uuid, text, text, jsonb, uuid, text)
  from public, anon, authenticated;

grant execute on function svas.registrar_cotizacion(jsonb) to service_role;
grant execute on function svas.actualizar_suma_asegurada(uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function svas.vincular_cliente(uuid, jsonb, uuid, text) to service_role;
grant execute on function svas.registrar_usuario_cliente(uuid, text, text, jsonb, uuid, text) to service_role;
grant execute on function svas.fmt_usd(numeric) to authenticated, service_role;

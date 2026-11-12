-- 0025 · RPCs de asesoría y retención (§6.5 a §6.11) + solicitar_asesoria,
--        enviar_enlace_compra y caducar_seguimientos
-- Fuente: contexto §5 (RN-07, RN-09..13), §6.5..6.11, §8.4, §8.5, §11; backend §3.6.4.
-- El doc las ubica en 0014; se numeran después de las ya aplicadas (0023).
--
-- Errores: P0001 → 400 (mensaje al usuario) · P0002 → 404 · 42501 → 403 ·
-- PT409 → 409 con el mensaje propio (PostgREST respeta el código PTxxx).
--
-- Tokens de retoma: 32 bytes aleatorios en base64url (igual que generarToken()
-- del backend); en la tabla solo queda sha256 hex. El token en claro sale UNA
-- vez hacia el backend para que el notificador lo envíe.
--
-- Diferido: 6.10 "sin orden" se suma cuando exista orden_compra (0010).

-- ── Internos (sin EXECUTE para nadie; los llaman otros SECURITY DEFINER) ────

-- Contacto del cliente de un seguimiento, para el notificador.
create or replace function svas._contacto_seguimiento(p_seguimiento_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = svas, public
as $$
  select jsonb_build_object(
           'seguimiento_id', sg.id,
           'cotizacion_id', sg.cotizacion_id,
           'nombres', c.nombres,
           'canal', c.canal_preferido,
           'telefono', c.telefono,
           'email', c.email)
    from svas.seguimiento sg
    join svas.cotizacion co on co.id = sg.cotizacion_id
    join svas.vehiculo v    on v.id = co.vehiculo_id
    join svas.cliente c     on c.id = v.cliente_id
   where sg.id = p_seguimiento_id;
$$;

-- Genera un enlace de retoma nuevo (reemplaza el anterior) y devuelve el token en claro.
create or replace function svas._emitir_enlace(p_seguimiento_id uuid)
returns text
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_token text;
  v_dias  smallint;
begin
  select vigencia_enlace_dias into v_dias from svas.parametros_comerciales where id = 1;
  v_token := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  update svas.seguimiento
     set enlace_token     = encode(extensions.digest(v_token, 'sha256'), 'hex'),
         enlace_expira_en = now() + make_interval(days => v_dias),
         enlace_usado_en  = null
   where id = p_seguimiento_id;
  return v_token;
end;
$$;

-- Cierra un seguimiento abierto. DESCARTADO genera el enlace del mensaje final (RN-12).
create or replace function svas._cerrar_seguimiento(
  p_seguimiento_id uuid,
  p_estado svas.estado_seguimiento,
  p_motivo svas.motivo_cierre
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_estado svas.estado_seguimiento;
  v_token  text;
begin
  select estado into v_estado from svas.seguimiento where id = p_seguimiento_id for update;
  if not found then
    raise exception 'El seguimiento no existe' using errcode = 'P0002';
  end if;
  -- RN-12: un seguimiento cerrado no vuelve a enviar mensajes.
  if v_estado <> 'EN_SEGUIMIENTO' then
    raise exception 'El seguimiento ya está cerrado';
  end if;

  update svas.seguimiento
     set estado        = p_estado,
         fecha_cierre  = now(),
         motivo_cierre = case when p_estado = 'DESCARTADO' then p_motivo end
   where id = p_seguimiento_id;

  if p_estado = 'DESCARTADO' then
    v_token := svas._emitir_enlace(p_seguimiento_id);
  end if;

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'CERRAR_SEGUIMIENTO', 'seguimiento', p_seguimiento_id,
          jsonb_build_object('estado', p_estado, 'motivo', p_motivo));

  return svas._contacto_seguimiento(p_seguimiento_id)
         || jsonb_build_object('estado', p_estado, 'motivo', p_motivo, 'enlace_token', v_token);
end;
$$;

-- Solicitud bloqueada y asignada al asesor actual, en EN_ATENCION.
create or replace function svas._solicitud_en_atencion(p_solicitud_id uuid)
returns svas.solicitud_asesoria
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v svas.solicitud_asesoria;
begin
  select * into v from svas.solicitud_asesoria where id = p_solicitud_id for update;
  if not found then
    raise exception 'La solicitud no existe' using errcode = 'P0002';
  end if;
  if v.estado = 'PENDIENTE' then
    raise exception 'Primero toma el caso';
  end if;
  if v.asesor_id is distinct from auth.uid() then
    raise exception 'Este caso está asignado a otro asesor' using errcode = '42501';
  end if;
  if v.estado = 'CERRADA' then
    raise exception 'La solicitud ya está cerrada';
  end if;
  return v;
end;
$$;

revoke all on function svas._contacto_seguimiento(uuid) from public, anon, authenticated, service_role;
revoke all on function svas._emitir_enlace(uuid) from public, anon, authenticated, service_role;
revoke all on function svas._cerrar_seguimiento(uuid, svas.estado_seguimiento, svas.motivo_cierre)
  from public, anon, authenticated, service_role;
revoke all on function svas._solicitud_en_atencion(uuid) from public, anon, authenticated, service_role;

-- ── POST /asesorias: el CLIENTE pide asesoría (origen CLIENTE) ──────────────
create or replace function svas.solicitar_asesoria(
  p_cotizacion_id uuid,
  p_motivo svas.motivo_asesoria,
  p_canal svas.canal_contacto
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_estado svas.estado_cotizacion;
  v        svas.solicitud_asesoria;
begin
  perform svas.exigir_rol(array['CLIENTE']);

  if not svas.es_duenio_cotizacion(p_cotizacion_id) then
    raise exception 'No encontramos tu cotización' using errcode = 'P0002';
  end if;

  if p_motivo is null or p_motivo not in ('DUDA', 'NEGOCIACION', 'DESCUENTO') then
    raise exception 'Elige el motivo: duda, negociación o descuento';
  end if;
  if p_canal is null then
    raise exception 'Elige cómo prefieres que te contactemos';
  end if;

  select estado into v_estado from svas.cotizacion where id = p_cotizacion_id for update;
  if v_estado = 'CONVERTIDA' then
    raise exception 'Esta cotización ya se convirtió en póliza';
  end if;

  if exists (select 1 from svas.solicitud_asesoria s
              where s.cotizacion_id = p_cotizacion_id and s.estado <> 'CERRADA') then
    raise exception 'Ya tienes una solicitud de asesoría abierta para esta cotización'
      using errcode = 'PT409';
  end if;

  insert into svas.solicitud_asesoria (cotizacion_id, motivo, canal, origen)
  values (p_cotizacion_id, p_motivo, p_canal, 'CLIENTE')
  returning * into v;

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'SOLICITAR_ASESORIA', 'solicitud_asesoria', v.id,
          jsonb_build_object('cotizacion_id', p_cotizacion_id, 'motivo', p_motivo));

  return to_jsonb(v);
end;
$$;

-- ── 6.5 tomar_solicitud ─────────────────────────────────────────────────────
create or replace function svas.tomar_solicitud(p_solicitud_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v svas.solicitud_asesoria;
begin
  perform svas.exigir_rol(array['ASESOR']);

  -- SKIP LOCKED: si otro asesor la está tomando ahora mismo, no se espera.
  select * into v
    from svas.solicitud_asesoria
   where id = p_solicitud_id
     for update skip locked;

  if not found then
    if exists (select 1 from svas.solicitud_asesoria where id = p_solicitud_id) then
      raise exception 'La solicitud ya fue tomada por otro asesor' using errcode = 'PT409';
    end if;
    raise exception 'La solicitud no existe' using errcode = 'P0002';
  end if;

  if v.estado <> 'PENDIENTE' then
    if v.asesor_id = auth.uid() and v.estado = 'EN_ATENCION' then
      return to_jsonb(v);   -- idempotente para el mismo asesor
    end if;
    raise exception 'La solicitud ya fue tomada por otro asesor' using errcode = 'PT409';
  end if;

  update svas.solicitud_asesoria
     set estado = 'EN_ATENCION', asesor_id = auth.uid()
   where id = p_solicitud_id
  returning * into v;

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id)
  values (auth.uid(), 'TOMAR_SOLICITUD', 'solicitud_asesoria', p_solicitud_id);

  return to_jsonb(v);
end;
$$;

-- ── 6.6 aplicar_descuento_negociado ─────────────────────────────────────────
create or replace function svas.aplicar_descuento_negociado(
  p_solicitud_id uuid,
  p_plan_id uuid,
  p_porcentaje numeric
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_sol      svas.solicitud_asesoria;
  v_max      numeric;
  v_aceptado boolean;
  v          svas.descuento;
begin
  perform svas.exigir_rol(array['ASESOR']);
  v_sol := svas._solicitud_en_atencion(p_solicitud_id);

  if p_porcentaje is null or p_porcentaje <= 0 then
    raise exception 'El descuento debe ser mayor que 0';
  end if;

  if not exists (select 1 from svas.prima_cotizada pc
                  where pc.cotizacion_id = v_sol.cotizacion_id
                    and pc.plan_id = p_plan_id
                    and pc.disponible) then
    raise exception 'Ese plan no está disponible en la cotización';
  end if;

  -- RN-09: un solo aceptado por cotización; queda el mayor.
  select max(d.porcentaje) into v_max
    from svas.descuento d
   where d.cotizacion_id = v_sol.cotizacion_id and d.aceptado;

  v_aceptado := v_max is null or round(p_porcentaje, 2) > v_max;

  if v_aceptado then
    update svas.descuento set aceptado = false
     where cotizacion_id = v_sol.cotizacion_id and aceptado;
  end if;

  -- T2 valida el tope (RN-07).
  insert into svas.descuento (cotizacion_id, plan_id, asesor_id, tipo, porcentaje, aceptado)
  values (v_sol.cotizacion_id, p_plan_id, auth.uid(), 'NEGOCIADO', round(p_porcentaje, 2), v_aceptado)
  returning * into v;

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'APLICAR_DESCUENTO', 'descuento', v.id,
          jsonb_build_object('solicitud_id', p_solicitud_id, 'plan_id', p_plan_id,
                             'porcentaje', v.porcentaje, 'aceptado', v_aceptado));

  return to_jsonb(v);
end;
$$;

-- ── 6.7 cerrar_solicitud ────────────────────────────────────────────────────
create or replace function svas.cerrar_solicitud(
  p_solicitud_id uuid,
  p_resultado text,
  p_acepta boolean
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v svas.solicitud_asesoria;
begin
  perform svas.exigir_rol(array['ASESOR']);
  v := svas._solicitud_en_atencion(p_solicitud_id);

  if nullif(btrim(p_resultado), '') is null then
    raise exception 'Describe el resultado de la atención';
  end if;
  if length(btrim(p_resultado)) > 200 then
    raise exception 'El resultado no puede pasar de 200 caracteres';
  end if;

  -- Si el cliente no acepta, ninguna prima negociada queda vigente.
  if not coalesce(p_acepta, false) then
    update svas.descuento set aceptado = false
     where cotizacion_id = v.cotizacion_id and tipo = 'NEGOCIADO' and aceptado;
  end if;

  update svas.solicitud_asesoria
     set estado = 'CERRADA', resultado = btrim(p_resultado)
   where id = p_solicitud_id
  returning * into v;

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'CERRAR_SOLICITUD', 'solicitud_asesoria', p_solicitud_id,
          jsonb_build_object('acepta', coalesce(p_acepta, false)));

  return to_jsonb(v) || jsonb_build_object('acepta', coalesce(p_acepta, false));
end;
$$;

-- ── 6.8 registrar_intento_contacto ──────────────────────────────────────────
create or replace function svas.registrar_intento_contacto(
  p_seguimiento_id uuid,
  p_canal svas.canal_contacto,
  p_resultado svas.resultado_intento
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_sg       record;
  v_max      smallint;
  v_dias     smallint;
  v_intentos smallint;
  v_cierre   jsonb;
begin
  perform svas.exigir_rol(array['ASESOR']);

  select sg.id, sg.estado, sg.intentos, sg.fecha_apertura, c.canal_preferido
    into v_sg
    from svas.seguimiento sg
    join svas.cotizacion co on co.id = sg.cotizacion_id
    join svas.vehiculo v    on v.id = co.vehiculo_id
    join svas.cliente c     on c.id = v.cliente_id
   where sg.id = p_seguimiento_id
     for update of sg;

  if not found then
    raise exception 'El seguimiento no existe' using errcode = 'P0002';
  end if;
  if v_sg.estado <> 'EN_SEGUIMIENTO' then
    raise exception 'El seguimiento ya está cerrado';
  end if;
  if p_canal is null or p_resultado is null then
    raise exception 'Indica el canal y el resultado del intento';
  end if;

  select max_intentos, dias_seguimiento into v_max, v_dias
    from svas.parametros_comerciales where id = 1;

  -- RN-10
  if p_canal <> v_sg.canal_preferido then
    raise exception 'El cliente prefiere que lo contacten por %', v_sg.canal_preferido;
  end if;
  if v_sg.intentos >= v_max then
    raise exception 'Se alcanzó el máximo de % intentos', v_max;
  end if;
  if now() > v_sg.fecha_apertura + make_interval(days => v_dias) then
    raise exception 'El seguimiento venció: pasaron más de % días', v_dias;
  end if;

  insert into svas.intento_contacto (seguimiento_id, asesor_id, canal, resultado)
  values (p_seguimiento_id, auth.uid(), p_canal, p_resultado);

  update svas.seguimiento set intentos = intentos + 1
   where id = p_seguimiento_id
  returning intentos into v_intentos;

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'REGISTRAR_INTENTO', 'seguimiento', p_seguimiento_id,
          jsonb_build_object('canal', p_canal, 'resultado', p_resultado, 'intento', v_intentos));

  -- Al alcanzar el máximo sin aceptación se cierra como DESCARTADO / NO_RESPONDE (RN-10).
  if v_intentos >= v_max and p_resultado <> 'ACEPTA' then
    v_cierre := svas._cerrar_seguimiento(p_seguimiento_id, 'DESCARTADO', 'NO_RESPONDE');
  end if;

  return jsonb_build_object('intentos', v_intentos, 'max_intentos', v_max, 'cierre', v_cierre);
end;
$$;

-- ── POST /seguimientos/:id/aceptacion: reenvía el enlace de compra ──────────
-- Exige un intento previo con resultado ACEPTA; el caso sigue abierto hasta la compra.
create or replace function svas.enviar_enlace_compra(p_seguimiento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_estado svas.estado_seguimiento;
  v_token  text;
begin
  perform svas.exigir_rol(array['ASESOR']);

  select estado into v_estado from svas.seguimiento where id = p_seguimiento_id for update;
  if not found then
    raise exception 'El seguimiento no existe' using errcode = 'P0002';
  end if;
  if v_estado <> 'EN_SEGUIMIENTO' then
    raise exception 'El seguimiento ya está cerrado';
  end if;
  if not exists (select 1 from svas.intento_contacto i
                  where i.seguimiento_id = p_seguimiento_id and i.resultado = 'ACEPTA') then
    raise exception 'Registra primero el intento en el que el cliente aceptó';
  end if;

  v_token := svas._emitir_enlace(p_seguimiento_id);

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id)
  values (auth.uid(), 'ENVIAR_ENLACE_COMPRA', 'seguimiento', p_seguimiento_id);

  return svas._contacto_seguimiento(p_seguimiento_id) || jsonb_build_object('enlace_token', v_token);
end;
$$;

-- ── 6.9 cerrar_seguimiento ──────────────────────────────────────────────────
create or replace function svas.cerrar_seguimiento(
  p_seguimiento_id uuid,
  p_estado svas.estado_seguimiento,
  p_motivo svas.motivo_cierre
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    perform svas.exigir_rol(array['ASESOR']);
  end if;

  if p_estado is null or p_estado = 'EN_SEGUIMIENTO' then
    raise exception 'El cierre debe ser CONVERTIDO o DESCARTADO';
  end if;
  if p_estado = 'DESCARTADO' and p_motivo is null then
    raise exception 'Elige el motivo del cierre';   -- RN-11
  end if;

  return svas._cerrar_seguimiento(p_seguimiento_id, p_estado,
                                  case when p_estado = 'DESCARTADO' then p_motivo end);
end;
$$;

-- ── 6.10 detectar_cotizaciones_abandonadas ──────────────────────────────────
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

-- ── Caducidad diaria (§11): cierra los vencidos y devuelve a quién avisar ───
create or replace function svas.caducar_seguimientos()
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v_dias   smallint;
  v_id     uuid;
  v_avisos jsonb := '[]'::jsonb;
begin
  if not pg_try_advisory_xact_lock(hashtext('svas.caducidad_seguimiento')) then
    return v_avisos;
  end if;

  select dias_seguimiento into v_dias from svas.parametros_comerciales where id = 1;

  for v_id in
    select sg.id from svas.seguimiento sg
     where sg.estado = 'EN_SEGUIMIENTO'
       and sg.fecha_apertura < now() - make_interval(days => v_dias)
     order by sg.fecha_apertura
       for update skip locked
  loop
    v_avisos := v_avisos || jsonb_build_array(
      svas._cerrar_seguimiento(v_id, 'DESCARTADO', 'NO_RESPONDE'));
  end loop;

  return v_avisos;
end;
$$;

-- ── 6.11 resolver_enlace_retoma ─────────────────────────────────────────────
-- p_nuevo_token_hash: sha256 del tokenAcceso nuevo que generó el backend
-- (el cliente vuelve a entrar a su cotización sin cuenta).
create or replace function svas.resolver_enlace_retoma(
  p_token_hash text,
  p_nuevo_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = svas, public
as $$
declare
  v         record;
  v_porcent numeric;
begin
  if coalesce(p_nuevo_token_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'El token de acceso nuevo no es válido';
  end if;

  select sg.id, sg.cotizacion_id, sg.enlace_expira_en, sg.enlace_usado_en, co.estado
    into v
    from svas.seguimiento sg
    join svas.cotizacion co on co.id = sg.cotizacion_id
   where sg.enlace_token = p_token_hash
     for update of sg, co;

  if not found then
    raise exception 'Este enlace no es válido' using errcode = 'P0002';
  end if;
  if v.enlace_usado_en is not null then
    raise exception 'Este enlace ya se usó. Puedes cotizar de nuevo en 1 minuto.';
  end if;
  if v.enlace_expira_en < now() then
    raise exception 'Este enlace venció. Puedes cotizar de nuevo en 1 minuto.';   -- RN-12
  end if;
  if v.estado = 'CONVERTIDA' then
    raise exception 'Esta cotización ya se convirtió en póliza';
  end if;

  update svas.seguimiento set enlace_usado_en = now() where id = v.id;
  update svas.cotizacion set token_acceso_hash = p_nuevo_token_hash where id = v.cotizacion_id;

  select descuento_primera_compra into v_porcent from svas.parametros_comerciales where id = 1;

  insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id)
  values (null, 'RESOLVER_RETOMA', 'seguimiento', v.id);

  return jsonb_build_object(
    'cotizacion_id', v.cotizacion_id,
    'descuento', jsonb_build_object('tipo', 'PRIMERA_COMPRA', 'porcentaje', v_porcent::text));
end;
$$;

-- ── Permisos ────────────────────────────────────────────────────────────────
revoke all on function svas.solicitar_asesoria(uuid, svas.motivo_asesoria, svas.canal_contacto) from public, anon;
revoke all on function svas.tomar_solicitud(uuid) from public, anon;
revoke all on function svas.aplicar_descuento_negociado(uuid, uuid, numeric) from public, anon;
revoke all on function svas.cerrar_solicitud(uuid, text, boolean) from public, anon;
revoke all on function svas.registrar_intento_contacto(uuid, svas.canal_contacto, svas.resultado_intento) from public, anon;
revoke all on function svas.enviar_enlace_compra(uuid) from public, anon;
revoke all on function svas.cerrar_seguimiento(uuid, svas.estado_seguimiento, svas.motivo_cierre) from public, anon;
revoke all on function svas.detectar_cotizaciones_abandonadas() from public, anon, authenticated;
revoke all on function svas.caducar_seguimientos() from public, anon, authenticated;
revoke all on function svas.resolver_enlace_retoma(text, text) from public, anon, authenticated;

grant execute on function svas.solicitar_asesoria(uuid, svas.motivo_asesoria, svas.canal_contacto) to authenticated;
grant execute on function svas.tomar_solicitud(uuid) to authenticated;
grant execute on function svas.aplicar_descuento_negociado(uuid, uuid, numeric) to authenticated;
grant execute on function svas.cerrar_solicitud(uuid, text, boolean) to authenticated;
grant execute on function svas.registrar_intento_contacto(uuid, svas.canal_contacto, svas.resultado_intento) to authenticated;
grant execute on function svas.enviar_enlace_compra(uuid) to authenticated;
grant execute on function svas.cerrar_seguimiento(uuid, svas.estado_seguimiento, svas.motivo_cierre) to authenticated, service_role;
grant execute on function svas.detectar_cotizaciones_abandonadas() to service_role;
grant execute on function svas.caducar_seguimientos() to service_role;
grant execute on function svas.resolver_enlace_retoma(text, text) to service_role;

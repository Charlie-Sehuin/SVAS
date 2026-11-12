-- 0032 · Arreglo de 0030: la vista v_plan_contenido_completitud daba 42501 (403) al administrador.
--
-- Una vista lee las tablas con los permisos de su dueño, pero el permiso para EJECUTAR
-- las funciones que llama se revisa con el usuario que consulta. 0030 le quitó a
-- authenticated el execute de fn_incoherencias_plan, así que la vista fallaba con
-- "permission denied for function fn_incoherencias_plan".
--
-- Arreglo: se da execute a authenticated y la función se protege por dentro. Con una
-- sesión de usuario (authenticated/anon) solo devuelve filas si es ADMINISTRADOR. Sin
-- sesión de usuario (postgres, service_role, migraciones) sigue respondiendo igual.

create or replace function svas.fn_incoherencias_plan(p_plan_id uuid)
returns table (codigo varchar, nombre varchar, incluida boolean, escenarios_que_cubren text[])
language sql
stable
security definer
set search_path = svas, public
as $$
  select c.codigo, c.nombre, pc.incluida,
         coalesce(array_agg(e.codigo order by e.orden) filter (where cpe.cubre), '{}')
    from svas.plan_cobertura pc
    join svas.cobertura c            on c.id = pc.cobertura_id and c.activa
    join svas.cobertura_escenario ce on ce.cobertura_id = c.id
    join svas.escenario_siniestro e  on e.id = ce.escenario_id and e.activo
    left join svas.cobertura_plan_escenario cpe
           on cpe.plan_id = pc.plan_id and cpe.escenario_id = e.id
   where pc.plan_id = p_plan_id
     and (coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
            not in ('authenticated', 'anon')
          or (select svas.rol_actual()) = 'ADMINISTRADOR')
   group by c.codigo, c.nombre, c.orden, pc.incluida
  having pc.incluida <> coalesce(bool_or(cpe.cubre), false)
   order by c.orden;
$$;

revoke execute on function svas.fn_incoherencias_plan(uuid) from public, anon;
grant execute on function svas.fn_incoherencias_plan(uuid) to authenticated;

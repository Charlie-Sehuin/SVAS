-- Borra SOLO los datos de demostración creados por crear-datos-demo.sql.
-- Criterio: clientes con correo clienteNN(N)@demo.svas.pe Y apellidos "Demo NN(N)" (fases 1 y 2); todo lo demás se alcanza desde ellos.
-- Un cliente real nunca cumple ambas condiciones. Se puede ejecutar varias veces.

do $demo$
declare
  v_clientes uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_clientes
    from svas.cliente
   where email ~* '^cliente[0-9]{2,3}@demo\.svas\.pe$' and apellidos ~ '^Demo [0-9]{2,3}$';

  create temp table _cot on commit drop as
    select co.id from svas.cotizacion co
      join svas.vehiculo v on v.id = co.vehiculo_id
     where v.cliente_id = any (v_clientes);

  delete from svas.poliza
   where orden_compra_id in (select id from svas.orden_compra where cotizacion_id in (select id from _cot));
  delete from svas.pago      -- las cuotas caen en cascada
   where orden_compra_id in (select id from svas.orden_compra where cotizacion_id in (select id from _cot));
  delete from svas.orden_compra where cotizacion_id in (select id from _cot);
  delete from svas.descuento    where cotizacion_id in (select id from _cot);
  delete from svas.solicitud_asesoria where cotizacion_id in (select id from _cot);
  delete from svas.seguimiento  where cotizacion_id in (select id from _cot);   -- los intentos caen en cascada
  delete from svas.cotizacion   where id in (select id from _cot);   -- opciones, primas y simulaciones caen en cascada
  delete from svas.vehiculo     where cliente_id = any (v_clientes); -- la ubicación cae en cascada
  delete from svas.cliente      where id = any (v_clientes);

  raise notice 'Clientes demo borrados: %', coalesce(array_length(v_clientes, 1), 0);
end
$demo$;

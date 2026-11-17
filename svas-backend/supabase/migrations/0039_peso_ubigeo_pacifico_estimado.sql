-- 0039 · peso_ubigeo de Pacífico para los distritos nuevos (estimación)
--   · Pacífico es la única aseguradora que usa el distrito en su fórmula (peso_ubigeo). La 0038 cargó 792
--     distritos nuevos sin peso; cotizaban con peso neutro 1,00 («ubigeo por defecto»). Esta migración les da un peso.
-- Fuente: hoja «Ubigeo Pacífico» de docs/base_vehiculos_aseguradoras.xlsx (73 pesos de Charlie) y 0038.
--
-- ESTIMACIÓN, NO ES UN DATO: el Excel aclara que sus valores son referenciales para el prototipo y no los reales de
-- Pacífico. Los pesos reales los define la aseguradora; esta migración extiende el patrón del Excel con una regla simple.
--
-- Errores: ninguno esperado; si la verificación final no cuadra, la migración falla y se deshace.
--
-- Ajustes propios (revisables):
--   · Regla: cada distrito nuevo toma el peso de la CAPITAL de su departamento (el ubigeo XX0101 del Excel). Los pesos del
--     Excel para las capitales van de 0,90 a 1,12 y siguen un patrón (ciudades grandes y costeras más altas, capitales de
--     sierra y selva más bajas): se hereda ese nivel, sin inventar diferencias entre distritos del mismo departamento.
--   · Lima y Callao no entran: sus distritos del Excel ya tienen peso propio, y los de las otras provincias de Lima
--     (30 distritos) siguen con el peso neutro 1,00 (cotizan igual; solo queda marcado «ubigeo por defecto»).
--   · No pisa nada: solo agrega filas a los ubigeos que todavía no tienen peso de Pacífico (on conflict do nothing).
--   · Para cambiar un peso, basta editar el valor de su departamento en la lista de abajo antes de aplicar, o ajustarlo
--     después desde Tarifas → ubigeo (el rango permitido es 0,5 a 3).

insert into svas.peso_ubigeo (aseguradora_id, ubigeo, peso)
select a.id, u.codigo, d.peso
  from svas.ubigeo u
  join (values
    ('01', 0.900),  -- Amazonas (capital: Chachapoyas)
    ('02', 0.950),  -- Áncash (capital: Huaraz)
    ('03', 0.900),  -- Apurímac (capital: Abancay)
    ('04', 1.050),  -- Arequipa (capital: Arequipa)
    ('05', 0.920),  -- Ayacucho (capital: Ayacucho)
    ('06', 0.920),  -- Cajamarca (capital: Cajamarca)
    ('08', 1.000),  -- Cusco (capital: Cusco)
    ('09', 0.900),  -- Huancavelica (capital: Huancavelica)
    ('10', 0.950),  -- Huánuco (capital: Huánuco)
    ('11', 1.020),  -- Ica (capital: Ica)
    ('12', 0.980),  -- Junín (capital: Huancayo)
    ('13', 1.120),  -- La Libertad (capital: Trujillo)
    ('14', 1.080),  -- Lambayeque (capital: Chiclayo)
    ('16', 0.950),  -- Loreto (capital: Iquitos)
    ('17', 0.950),  -- Madre de Dios (capital: Tambopata)
    ('18', 0.920),  -- Moquegua (capital: Moquegua)
    ('19', 0.920),  -- Pasco (capital: Chaupimarca)
    ('20', 1.080),  -- Piura (capital: Piura)
    ('21', 0.920),  -- Puno (capital: Puno)
    ('22', 0.920),  -- San Martín (capital: Moyobamba)
    ('23', 0.950),  -- Tacna (capital: Tacna)
    ('24', 0.950),  -- Tumbes (capital: Tumbes)
    ('25', 1.000)  -- Ucayali (capital: Callería)
  ) as d (cod_dep, peso) on left(u.codigo, 2) = d.cod_dep
  join svas.aseguradora a on a.codigo_estrategia = 'PACIFICO'
 where not exists (
         select 1 from svas.peso_ubigeo p where p.aseguradora_id = a.id and p.ubigeo = u.codigo)
on conflict (aseguradora_id, ubigeo) do nothing;

-- ── Verificación (si algo no cuadra, la migración falla y se deshace) ───────
do $$
declare
  v_pesos int;
begin
  select count(*) into v_pesos
    from svas.peso_ubigeo p
    join svas.aseguradora a on a.id = p.aseguradora_id and a.codigo_estrategia = 'PACIFICO';
  if v_pesos < 835 then
    raise exception '0039: se esperaban al menos 835 pesos de Pacífico y hay %', v_pesos;
  end if;
end;
$$;

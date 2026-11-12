-- 0031 · Seed del contenido comercial de los 10 planes (el doc lo llama 0021)
-- Fuente: contexto §18.3 (catálogo), §18.4 (matriz), §18.5 (textos y detalle),
-- §18.6 (exclusiones), §18.7 (requisitos). Todo es ILUSTRATIVO (RN-26, RN-46).
-- Las descripciones de las 13 coberturas (§18.3 solo da el nombre) las propuso Claude.
--
-- Además alinea la Prueba de Choque con §18.5 (el doc manda): el seed 0027
-- tenía topes de RC de 30 000 / 50 000 y 10 y 7 días de reemplazo en
-- Pacífico Premium y La Positiva Full; §18.5 dice RC de 60 000 a 200 000 y
-- 15 y 20 días. No cambia ningún resultado del motor de hoy (el daño a
-- terceros es 2 500, muy por debajo de cualquier tope) y queda en la bitácora.
-- Las simulaciones ya guardadas no cambian (RN-32).
--
-- Al final verifica RN-42 / RN-43 y los conteos de §18.10; si algo no cuadra,
-- la migración falla.

-- ── Catálogo de coberturas (13) ─────────────────────────────────────────────
insert into svas.cobertura (codigo, nombre, categoria, descripcion, orden)
values
  ('DANO_CHOQUE',      'Daño propio por choque o vuelco', 'DANOS_PROPIOS',
   'Repara o indemniza tu auto si choca o se vuelca, descontando el deducible del plan.', 1),
  ('INCENDIO',         'Incendio y explosión', 'DANOS_PROPIOS',
   'Daños a tu auto por fuego o explosión, sea por accidente o por una causa externa.', 2),
  ('DESASTRES',        'Desastres naturales (sismo, inundación, huaico)', 'DANOS_PROPIOS',
   'Daños por sismo, inundación, huaico, lluvia intensa o deslizamiento.', 3),
  ('LUNAS',            'Rotura de lunas (parabrisas, laterales y luneta)', 'DANOS_PROPIOS',
   'Reposición del parabrisas, las lunas laterales y la luneta si se rompen.', 4),
  ('ROBO_TOTAL',       'Robo total del vehículo', 'ROBO',
   'Indemnización si te roban el auto completo y no aparece.', 5),
  ('ROBO_PARCIAL',     'Robo de autopartes y accesorios originales', 'ROBO',
   'Reposición de espejos, faros, aros, logos y otras piezas originales robadas.', 6),
  ('RC_TERCEROS',      'Responsabilidad civil frente a terceros', 'RESPONSABILIDAD',
   'Paga los daños que causes a otras personas, autos o propiedades, hasta el límite del plan.', 7),
  ('ACC_OCUPANTES',    'Accidentes personales para ocupantes', 'RESPONSABILIDAD',
   'Gastos médicos e indemnización para el conductor y los pasajeros lesionados en un accidente.', 8),
  ('AUXILIO_MECANICO', 'Auxilio mecánico y grúa', 'ASISTENCIA',
   'Grúa, cambio de llanta, batería o combustible si el auto se queda en la vía.', 9),
  ('CHOFER_REEMPLAZO', 'Chofer de reemplazo', 'ASISTENCIA',
   'Un chofer lleva tu auto cuando tú no puedes manejar.', 10),
  ('AUTO_REEMPLAZO',   'Vehículo de reemplazo mientras el tuyo está en taller', 'ASISTENCIA',
   'Te prestan un auto mientras el tuyo se repara por un siniestro cubierto.', 11),
  ('ASISTENCIA_LEGAL', 'Asistencia legal', 'ASISTENCIA',
   'Orientación o abogado si tienes un accidente y debes ir a la comisaría o al juzgado.', 12),
  ('EXTRATERRITORIAL', 'Cobertura en países vecinos', 'ADICIONAL',
   'Mantiene la cobertura cuando viajas en tu auto a países vecinos.', 13);

-- ── Cobertura ↔ escenario de la Prueba de Choque (6 filas, §18.3) ───────────
insert into svas.cobertura_escenario (cobertura_id, escenario_id)
select c.id, e.id
  from (values ('DANO_CHOQUE', 'CHOQUE_LEVE'), ('DANO_CHOQUE', 'CHOQUE_FUERTE'),
               ('DANO_CHOQUE', 'PERDIDA_TOTAL'), ('ROBO_TOTAL', 'ROBO_TOTAL'),
               ('ROBO_PARCIAL', 'ROBO_AUTOPARTES'), ('RC_TERCEROS', 'DANO_TERCEROS')) v(cob, esc)
  join svas.cobertura c on c.codigo = v.cob
  join svas.escenario_siniestro e on e.codigo = v.esc;

-- ── Planes: resumen, ideal para y orden (§18.5; la descripción ya vino en 0016) ─
create temp table _plan_seed as
select p.id as plan_id, v.*
  from (values
    -- estrategia,   plan,      orden, matriz (orden de §18.3: 1 = ✓), resumen, ideal para, edad mínima
    ('RIMAC',       'Plata',    1, '1110101110000', 'Protección esencial para el uso diario',
     'Quien usa el auto a diario y quiere lo esencial a buen precio', 23),
    ('RIMAC',       'Oro',      2, '1111111111111', 'Cobertura ampliada con lunas, autopartes y asistencia completa',
     'Quien no quiere quedarse sin auto ni preocuparse por trámites', 21),
    ('PACIFICO',    'Básico',   1, '1100101010000', 'Cobertura económica para daños y robo total',
     'Autos de uso ocasional con presupuesto ajustado', 25),
    ('PACIFICO',    'Premium',  2, '1111111111111', 'Cobertura total con asistencia ilimitada y presencia en la región',
     'Autos de alto valor o uso intensivo que viajan a países vecinos', 21),
    ('LA_POSITIVA', 'Clásico',  1, '1111101110010', 'Cobertura equilibrada con desastres naturales y orientación legal',
     'Familias que buscan equilibrio entre precio y cobertura', 23),
    ('LA_POSITIVA', 'Full',     2, '1111111111111', 'Cobertura completa, con los límites más altos',
     'Quien usa el auto para trabajar o viaja con frecuencia', 21),
    ('MAPFRE',      'Esencial', 1, '1100101010000', 'Cobertura mínima para autos de bajo valor',
     'Autos antiguos o de bajo valor', 25),
    ('MAPFRE',      'Total',    2, '1111111111100', 'Cobertura amplia con asistencia ilimitada',
     'Uso diario en ciudad con buena protección', 23),
    ('QUALITAS',    'Estándar', 1, '1110101110000', 'Cobertura básica con desastres naturales y ocupantes',
     'Conductores que quieren lo básico con el descuento comercial de Qualitas', 23),
    ('QUALITAS',    'Plus',     2, '1111111111110', 'Cobertura ampliada con lunas, autopartes y reemplazo',
     'Quien quiere más protección sin pagar el máximo', 21)
  ) v(estrategia, plan, orden, matriz, resumen, ideal_para, edad)
  join svas.aseguradora a on a.codigo_estrategia = v.estrategia
  join svas.plan p        on p.aseguradora_id = a.id and p.nombre = v.plan;

do $$
begin
  if (select count(*) from _plan_seed) <> 10 then
    raise exception 'Seed 0031: se esperaban 10 planes y se encontraron %', (select count(*) from _plan_seed);
  end if;
end;
$$;

update svas.plan p
   set resumen = s.resumen, ideal_para = s.ideal_para, orden = s.orden,
       contenido_actualizado_en = now()
  from _plan_seed s
 where p.id = s.plan_id;

-- ── Qué cubre / qué no cubre (130 filas = 10 × 13) ──────────────────────────
-- Detalle y límite de §18.5 (lo que no figura queda en null).
create temp table _detalle as
select * from (values
  ('Plata',    'RC_TERCEROS',      'Hasta USD 100,000',            100000),
  ('Plata',    'ACC_OCUPANTES',    'Hasta USD 5,000 por persona',    5000),
  ('Plata',    'AUXILIO_MECANICO', '4 servicios al año',             null),
  ('Oro',      'RC_TERCEROS',      'Hasta USD 200,000',            200000),
  ('Oro',      'ACC_OCUPANTES',    'Hasta USD 15,000 por persona',  15000),
  ('Oro',      'AUXILIO_MECANICO', 'Sin límite de servicios',        null),
  ('Oro',      'CHOFER_REEMPLAZO', '2 servicios al año',             null),
  ('Oro',      'AUTO_REEMPLAZO',   'Hasta 10 días',                  null),
  ('Oro',      'ASISTENCIA_LEGAL', 'Abogado en comisaría',           null),
  ('Oro',      'EXTRATERRITORIAL', 'Bolivia, Chile, Colombia y Ecuador', null),
  ('Básico',   'RC_TERCEROS',      'Hasta USD 80,000',              80000),
  ('Básico',   'AUXILIO_MECANICO', '2 servicios al año',             null),
  ('Premium',  'RC_TERCEROS',      'Hasta USD 150,000',            150000),
  ('Premium',  'ACC_OCUPANTES',    'Hasta USD 20,000 por persona',  20000),
  ('Premium',  'AUXILIO_MECANICO', 'Sin límite de servicios',        null),
  ('Premium',  'CHOFER_REEMPLAZO', '3 servicios al año',             null),
  ('Premium',  'AUTO_REEMPLAZO',   'Hasta 15 días',                  null),
  ('Premium',  'ASISTENCIA_LEGAL', 'Abogado en comisaría',           null),
  ('Premium',  'EXTRATERRITORIAL', 'Bolivia, Chile, Colombia y Ecuador', null),
  ('Clásico',  'RC_TERCEROS',      'Hasta USD 100,000',            100000),
  ('Clásico',  'ACC_OCUPANTES',    'Hasta USD 10,000 por persona',  10000),
  ('Clásico',  'AUXILIO_MECANICO', '3 servicios al año',             null),
  ('Clásico',  'ASISTENCIA_LEGAL', 'Orientación legal telefónica',   null),
  ('Full',     'RC_TERCEROS',      'Hasta USD 200,000',            200000),
  ('Full',     'ACC_OCUPANTES',    'Hasta USD 25,000 por persona',  25000),
  ('Full',     'AUXILIO_MECANICO', 'Sin límite de servicios',        null),
  ('Full',     'CHOFER_REEMPLAZO', '4 servicios al año',             null),
  ('Full',     'AUTO_REEMPLAZO',   'Hasta 20 días',                  null),
  ('Full',     'ASISTENCIA_LEGAL', 'Abogado en comisaría',           null),
  ('Full',     'EXTRATERRITORIAL', 'Bolivia, Chile, Colombia y Ecuador', null),
  ('Esencial', 'RC_TERCEROS',      'Hasta USD 60,000',              60000),
  ('Esencial', 'AUXILIO_MECANICO', '2 servicios al año',             null),
  ('Total',    'RC_TERCEROS',      'Hasta USD 150,000',            150000),
  ('Total',    'ACC_OCUPANTES',    'Hasta USD 15,000 por persona',  15000),
  ('Total',    'AUXILIO_MECANICO', 'Sin límite de servicios',        null),
  ('Total',    'CHOFER_REEMPLAZO', '2 servicios al año',             null),
  ('Total',    'AUTO_REEMPLAZO',   'Hasta 10 días',                  null),
  ('Estándar', 'RC_TERCEROS',      'Hasta USD 80,000',              80000),
  ('Estándar', 'ACC_OCUPANTES',    'Hasta USD 5,000 por persona',    5000),
  ('Estándar', 'AUXILIO_MECANICO', '3 servicios al año',             null),
  ('Plus',     'RC_TERCEROS',      'Hasta USD 120,000',            120000),
  ('Plus',     'ACC_OCUPANTES',    'Hasta USD 12,000 por persona',  12000),
  ('Plus',     'AUXILIO_MECANICO', 'Sin límite de servicios',        null),
  ('Plus',     'CHOFER_REEMPLAZO', '2 servicios al año',             null),
  ('Plus',     'AUTO_REEMPLAZO',   'Hasta 7 días',                   null),
  ('Plus',     'ASISTENCIA_LEGAL', 'Orientación legal telefónica',   null)
) v(plan, codigo, detalle, limite);

insert into svas.plan_cobertura (plan_id, cobertura_id, incluida, detalle, limite_monto)
select s.plan_id, c.id, x.incluida,
       case when x.incluida then d.detalle end,
       case when x.incluida then d.limite::numeric(12,2) end
  from _plan_seed s
  cross join svas.cobertura c
  cross join lateral (select substr(s.matriz, c.orden, 1) = '1' as incluida) x
  left join _detalle d on d.plan = s.plan and d.codigo = c.codigo;

-- ── Exclusiones (70 = 6 comunes × 10 + 1 propia × 10, §18.6) ────────────────
insert into svas.plan_exclusion (plan_id, texto, orden)
select s.plan_id, x.texto, x.orden
  from _plan_seed s
  cross join (values
    (1, 'Conducir con alcohol sobre el límite legal o bajo efectos de drogas'),
    (2, 'Conducir sin licencia vigente o con licencia de otra categoría'),
    (3, 'Uso distinto al declarado (por ejemplo, taxi o aplicativo si se declaró uso particular)'),
    (4, 'Desgaste, falla mecánica o falta de mantenimiento'),
    (5, 'Carreras, competencias y pruebas de velocidad'),
    (6, 'Guerra, invasión y energía nuclear')
  ) x(orden, texto);

-- "Fuera del territorio peruano" si y solo si EXTRATERRITORIAL es ✗.
insert into svas.plan_exclusion (plan_id, texto, orden)
select s.plan_id,
       case when substr(s.matriz, 13, 1) = '1'
            then 'Daños a mercadería o carga transportada'
            else 'Daños ocurridos fuera del territorio peruano' end,
       7
  from _plan_seed s;

-- ── Requisitos (40 = 4 × 10, §18.7) ─────────────────────────────────────────
insert into svas.plan_requisito (plan_id, tipo, texto, obligatorio, orden)
select s.plan_id, r.tipo,
       case r.tipo when 'CONDUCTOR'
         then format('Conductor habitual con licencia vigente y mayor de %s años', s.edad)
         else r.texto end,
       true, r.orden
  from _plan_seed s
  cross join (values
    (1, 'VEHICULO',   'Vehículo del año 2015 al 2026 (antigüedad máxima 12 años)'),
    (2, 'CONDUCTOR',  null),
    (3, 'DOCUMENTO',  'DNI o carné de extranjería vigente y tarjeta de identificación vehicular'),
    (4, 'INSPECCION', 'Inspección previa si la regla de inspección de la aseguradora la exige para tu uso (se avisa al cotizar)')
  ) r(orden, tipo, texto);

-- ── Alinear la Prueba de Choque con §18.5 (RC y días de reemplazo) ──────────
create temp table _alineacion as
with objetivo as (
  select s.plan_id, s.plan,
         (select d.limite::numeric(12,2) from _detalle d
           where d.plan = s.plan and d.codigo = 'RC_TERCEROS') as rc,
         coalesce((select substring(d.detalle from 'Hasta (\d+) días')::smallint from _detalle d
                    where d.plan = s.plan and d.codigo = 'AUTO_REEMPLAZO'), 0) as dias
    from _plan_seed s
)
select cpe.id, o.plan, e.codigo as escenario,
       cpe.tope_cobertura as tope_antes, cpe.dias_auto_reemplazo as dias_antes,
       case when e.codigo = 'DANO_TERCEROS' then o.rc else cpe.tope_cobertura end as tope_despues,
       case when cpe.cubre and e.codigo <> 'DANO_TERCEROS' then o.dias else cpe.dias_auto_reemplazo end
         as dias_despues
  from objetivo o
  join svas.cobertura_plan_escenario cpe on cpe.plan_id = o.plan_id
  join svas.escenario_siniestro e on e.id = cpe.escenario_id;

delete from _alineacion
 where tope_antes is not distinct from tope_despues and dias_antes = dias_despues;

update svas.cobertura_plan_escenario cpe
   set tope_cobertura = a.tope_despues,
       dias_auto_reemplazo = a.dias_despues,
       actualizado_en = now()
  from _alineacion a
 where cpe.id = a.id;

insert into svas.registro_actividad (usuario_id, accion, entidad, entidad_id, detalle)
select null, 'ALINEAR_PRUEBA_CHOQUE_CONTENIDO', 'cobertura_plan_escenario', null,
       jsonb_build_object(
         'motivo', 'Seed 0031: topes de RC y días de reemplazo según el contenido de los planes (contexto §18.5)',
         'cambios', jsonb_agg(jsonb_build_object(
           'plan', a.plan, 'escenario', a.escenario,
           'antes', jsonb_build_object('tope_cobertura', a.tope_antes, 'dias_auto_reemplazo', a.dias_antes),
           'despues', jsonb_build_object('tope_cobertura', a.tope_despues, 'dias_auto_reemplazo', a.dias_despues))
           order by a.plan, a.escenario))
  from _alineacion a
having count(*) > 0;

-- ── Verificación (§18.10): si algo no cuadra, la migración falla ────────────
do $$
declare
  v int;
  v_txt text;
begin
  select count(*) into v from svas.cobertura where activa;
  if v <> 13 then raise exception 'Seed 0031: % coberturas (se esperaban 13)', v; end if;

  select count(*) into v from svas.cobertura_escenario;
  if v <> 6 then raise exception 'Seed 0031: % filas cobertura_escenario (se esperaban 6)', v; end if;

  select count(*) filter (where incluida) into v from svas.plan_cobertura;
  if v <> 95 then raise exception 'Seed 0031: % coberturas incluidas (se esperaban 95)', v; end if;
  select count(*) filter (where not incluida) into v from svas.plan_cobertura;
  if v <> 35 then raise exception 'Seed 0031: % coberturas no incluidas (se esperaban 35)', v; end if;

  select count(*) into v from svas.plan_exclusion;
  if v <> 70 then raise exception 'Seed 0031: % exclusiones (se esperaban 70)', v; end if;
  select count(*) into v from svas.plan_requisito;
  if v <> 40 then raise exception 'Seed 0031: % requisitos (se esperaban 40)', v; end if;

  -- RN-42: cada plan del seed con las 13 coberturas, textos, requisitos y exclusiones.
  select string_agg(s.plan, ', ') into v_txt
    from _plan_seed s join svas.plan p on p.id = s.plan_id
   where (select count(*) from svas.plan_cobertura pc where pc.plan_id = p.id) <> 13
      or coalesce(btrim(p.resumen), '') = '' or coalesce(btrim(p.descripcion), '') = ''
      or coalesce(btrim(p.ideal_para), '') = '';
  if v_txt is not null then raise exception 'Seed 0031: contenido incompleto en %', v_txt; end if;

  -- RN-43: sin contradicciones con la Prueba de Choque.
  select string_agg(s.plan || ':' || i.codigo, ', ') into v_txt
    from _plan_seed s cross join lateral svas.fn_incoherencias_plan(s.plan_id) i;
  if v_txt is not null then raise exception 'Seed 0031: incoherencias RN-43 en %', v_txt; end if;

  -- "Fuera del territorio peruano" ⇔ EXTRATERRITORIAL ✗.
  select string_agg(s.plan, ', ') into v_txt
    from _plan_seed s
   where (substr(s.matriz, 13, 1) = '0') <> exists (
           select 1 from svas.plan_exclusion x
            where x.plan_id = s.plan_id and x.texto = 'Daños ocurridos fuera del territorio peruano');
  if v_txt is not null then raise exception 'Seed 0031: exclusión territorial incoherente en %', v_txt; end if;
end;
$$;

drop table _alineacion;
drop table _detalle;
drop table _plan_seed;

-- 0027 · Seed de la Prueba de Choque (el doc lo llama 0018)
-- Fuente: contexto §16.2 (escenarios), §18.4 (matriz plan × cobertura), §9.
--
-- TODOS los valores son SUPUESTOS REFERENCIALES propuestos para arrancar
-- (RN-31): los valida el negocio y los edita el administrador.
--   · 6 escenarios (§16.2, montos en USD).
--   · 60 coberturas plan × escenario. "cubre" sale de la matriz 18.4 para que
--     0021 (contenido de planes) encuentre las dos fuentes coherentes (RN-43):
--       choque o vuelco → CHOQUE_LEVE, CHOQUE_FUERTE, PERDIDA_TOTAL (✓ en los 10)
--       robo total → ROBO_TOTAL (✓ en los 10)
--       robo de autopartes → ROBO_AUTOPARTES (✓ solo en el plan alto de cada aseguradora)
--       responsabilidad civil → DANO_TERCEROS (✓ en los 10)
--     El plan alto tiene vehículo de reemplazo (18.4) → días de reemplazo > 0.
--   · 54 frecuencias = 6 escenarios × 3 usos × 3 zonas (base × zona × uso).
--   · 50 zonas: los distritos de Lima Metropolitana y Callao; el resto → MEDIA.
--   · 9 factores de perfil.

-- ── Escenarios ──────────────────────────────────────────────────────────────
insert into svas.escenario_siniestro
  (codigo, nombre, descripcion, monto_dano_referencial, dias_taller_estimados, orden)
values
  ('CHOQUE_LEVE',     'Choque leve',            'Raspas el parachoques al estacionar',          600.00,  3, 1),
  ('CHOQUE_FUERTE',   'Choque fuerte',          'Choque con daño en carrocería y faros',       3500.00, 12, 2),
  ('ROBO_AUTOPARTES', 'Robo de autopartes',     'Te roban espejos, faros o logo en la calle',   900.00,  2, 3),
  ('ROBO_TOTAL',      'Robo total',             'Se llevan el auto',                              null, 30, 4),
  ('DANO_TERCEROS',   'Daño a terceros',        'Dañas otro auto o una propiedad',             2500.00,  0, 5),
  ('PERDIDA_TOTAL',   'Pérdida total',          'El auto no se puede reparar',                    null, 30, 6);

-- ── Coberturas plan × escenario ─────────────────────────────────────────────
with plan_param (estrategia, plan, alto, choque_pct, choque_min, total_pct, total_min,
                 autopartes_pct, autopartes_min, rc_tope, reemplazo) as (
  values
    ('RIMAC',       'Plata',    false, 15, 300, 20, 500, null::numeric, null::numeric, 30000, 0),
    ('RIMAC',       'Oro',      true,  10, 150, 10, 300, 15,            100,           50000, 10),
    ('PACIFICO',    'Básico',   false, 15, 350, 20, 600, null,          null,          30000, 0),
    ('PACIFICO',    'Premium',  true,  10, 200, 10, 300, 10,            150,           50000, 10),
    ('LA_POSITIVA', 'Clásico',  false, 12, 300, 15, 500, null,          null,          30000, 0),
    ('LA_POSITIVA', 'Full',     true,  10, 150, 10, 250, 15,            120,           50000, 7),
    ('MAPFRE',      'Esencial', false, 15, 250, 20, 500, null,          null,          30000, 0),
    ('MAPFRE',      'Total',    true,  10, 200, 10, 300, 15,            150,           50000, 10),
    ('QUALITAS',    'Estándar', false, 15, 300, 20, 450, null,          null,          30000, 0),
    ('QUALITAS',    'Plus',     true,  10, 180, 12, 300, 15,            100,           50000, 7)
),
planes as (
  select p.id as plan_id, pp.*
    from plan_param pp
    join svas.aseguradora a on a.codigo_estrategia = pp.estrategia
    join svas.plan p        on p.aseguradora_id = a.id and p.nombre = pp.plan
)
insert into svas.cobertura_plan_escenario
  (plan_id, escenario_id, cubre, deducible_pct, deducible_minimo, tope_cobertura,
   condicion_taller, dias_auto_reemplazo, fuente)
select pl.plan_id,
       e.id,
       x.cubre,
       x.pct,
       x.minimo,
       x.tope,
       case when pl.alto then 'CUALQUIERA' else 'AFILIADO' end::svas.condicion_taller,
       case when x.cubre and e.codigo <> 'DANO_TERCEROS' then pl.reemplazo else 0 end,
       'Supuesto referencial (seed 0027, a validar con el negocio, RN-31)'
  from planes pl
  cross join svas.escenario_siniestro e
  cross join lateral (
    select
      case e.codigo when 'ROBO_AUTOPARTES' then pl.alto else true end as cubre,
      case e.codigo
        when 'CHOQUE_LEVE'     then pl.choque_pct
        when 'CHOQUE_FUERTE'   then pl.choque_pct
        when 'ROBO_TOTAL'      then pl.total_pct
        when 'PERDIDA_TOTAL'   then pl.total_pct
        when 'ROBO_AUTOPARTES' then pl.autopartes_pct
        when 'DANO_TERCEROS'   then 0
      end::numeric as pct,
      case e.codigo
        when 'CHOQUE_LEVE'     then pl.choque_min
        when 'CHOQUE_FUERTE'   then pl.choque_min
        when 'ROBO_TOTAL'      then pl.total_min
        when 'PERDIDA_TOTAL'   then pl.total_min
        when 'ROBO_AUTOPARTES' then pl.autopartes_min
        when 'DANO_TERCEROS'   then 0
      end::numeric as minimo,
      case e.codigo when 'DANO_TERCEROS' then pl.rc_tope end::numeric as tope
  ) x;

-- ── Frecuencias (base PARTICULAR/MEDIA × factor de zona × factor de uso) ────
with base (codigo, p, f_alta, f_baja) as (
  values
    ('CHOQUE_LEVE',     0.2000, 1.10, 0.90),
    ('CHOQUE_FUERTE',   0.0500, 1.10, 0.90),
    ('ROBO_AUTOPARTES', 0.1200, 1.50, 0.60),
    ('ROBO_TOTAL',      0.0100, 1.60, 0.50),
    ('DANO_TERCEROS',   0.0600, 1.10, 0.90),
    ('PERDIDA_TOTAL',   0.0050, 1.10, 0.90)
),
zonas (zona, z) as (
  values ('ALTA'::svas.zona_riesgo, 'ALTA'), ('MEDIA', 'MEDIA'), ('BAJA', 'BAJA')
),
usos (uso, f_uso) as (
  values ('PARTICULAR'::svas.uso_vehiculo, 1.00),
         ('COMERCIAL_LIGERO', 1.40),
         ('TRANSPORTE_PASAJEROS', 1.80)
)
insert into svas.frecuencia_escenario (escenario_id, uso, zona, probabilidad_anual)
select e.id, u.uso, z.zona,
       least(0.9500, round(b.p * case z.z when 'ALTA' then b.f_alta
                                          when 'BAJA' then b.f_baja
                                          else 1 end * u.f_uso, 4))
  from base b
  join svas.escenario_siniestro e on e.codigo = b.codigo
  cross join zonas z
  cross join usos u;

-- ── Zonas de riesgo (Lima Metropolitana y Callao) ───────────────────────────
-- Supuesto referencial basado en percepción de robo vehicular; a validar.
insert into svas.zona_riesgo_distrito (ubigeo, zona)
select u.codigo,
       case
         when u.codigo in ('150101','150103','150105','150106','150110','150111','150112',
                           '150115','150117','150125','150128','150132','150133','150135',
                           '150137','150142','150143','070101','070103')
           then 'ALTA'
         when u.codigo in ('150104','150113','150114','150116','150120','150121','150122',
                           '150130','150131','150140','070105','150138')
           then 'BAJA'
         else 'MEDIA'
       end::svas.zona_riesgo
  from svas.ubigeo u
 where u.codigo like '1501%' or u.codigo like '0701%';

-- ── Factores de perfil (multiplican la probabilidad si la respuesta es "sí") ─
insert into svas.factor_perfil (escenario_id, variable, multiplicador)
select e.id, f.variable::svas.variable_perfil, f.m
  from (values
          ('ROBO_AUTOPARTES', 'ESTACIONA_COCHERA', 0.50),
          ('ROBO_TOTAL',      'ESTACIONA_COCHERA', 0.60),
          ('CHOQUE_LEVE',     'ESTACIONA_COCHERA', 0.80),
          ('CHOQUE_LEVE',     'KM_MES_ALTO',       1.30),
          ('CHOQUE_FUERTE',   'KM_MES_ALTO',       1.40),
          ('DANO_TERCEROS',   'KM_MES_ALTO',       1.30),
          ('CHOQUE_FUERTE',   'USO_NOCTURNO',      1.30),
          ('ROBO_TOTAL',      'USO_NOCTURNO',      1.40),
          ('ROBO_AUTOPARTES', 'USO_NOCTURNO',      1.30)
       ) f (codigo, variable, m)
  join svas.escenario_siniestro e on e.codigo = f.codigo;

-- ── Verificación (si algo no cuadra, la migración falla) ────────────────────
do $$
declare
  v_cob int; v_frec int; v_zon int; v_fac int; v_rn43 int;
begin
  select count(*) into v_cob  from svas.cobertura_plan_escenario;
  select count(*) into v_frec from svas.frecuencia_escenario;
  select count(*) into v_zon  from svas.zona_riesgo_distrito;
  select count(*) into v_fac  from svas.factor_perfil;
  -- Autopartes: 5 planes la cubren y 5 no (matriz 18.4).
  select count(*) into v_rn43
    from svas.cobertura_plan_escenario c
    join svas.escenario_siniestro e on e.id = c.escenario_id
   where e.codigo = 'ROBO_AUTOPARTES' and c.cubre;
  if v_cob <> 60 or v_frec <> 54 or v_zon <> 50 or v_fac <> 9 or v_rn43 <> 5 then
    raise exception 'Seed 0027 incompleto: coberturas=% frecuencias=% zonas=% factores=% autopartes=%',
      v_cob, v_frec, v_zon, v_fac, v_rn43;
  end if;
end $$;

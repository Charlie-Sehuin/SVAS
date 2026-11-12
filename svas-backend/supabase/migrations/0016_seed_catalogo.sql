-- 0016 · Seed del catálogo: 1 parámetros, 5 aseguradoras, 10 planes (2 por
--        aseguradora), 15 reglas de inspección, 22 campos, 6 valores.
-- Fuente: contexto §4.1, §17.4 (nombres de plan) y hoja "Planes Descripción" de
-- docs/base_vehiculos_aseguradoras.xlsx. Datos ILUSTRATIVOS (RN-26).
-- Idempotente: ON CONFLICT DO NOTHING (se puede reaplicar sin duplicar).
--
-- Campos (RN-17, el formulario es la unión de los activos):
--   · marca, modelo, anio — las 5 aseguradoras (LISTA, CATALOGO)        → 15
--   · ubigeo — Pacífico (lo usa su fórmula, peso_ubigeo)                →  1
--   · tipo   — La Positiva (peso_tipo; no se pregunta: sale del modelo) →  1
--   · placa  — Rímac, Pacífico, Mapfre (TEXTO, opcional; se pide al comprar) → 3
--   · clase  — La Positiva, Qualitas (LISTA, ESTATICO, opcional)        →  2
--   Total 22 campos; clase lleva 3 valores × 2 = 6 valores.
-- Reglas de inspección: 5 aseguradoras × 3 usos = 15. Solo TRANSPORTE_PASAJEROS
-- exige inspección previa (RN-01: pasajeros → solo ASESORIA).

-- ── Parámetros comerciales (valores por defecto de la tabla) ────────────────
insert into svas.parametros_comerciales (id) values (1)
on conflict (id) do nothing;

-- ── Aseguradoras ────────────────────────────────────────────────────────────
insert into svas.aseguradora (nombre, codigo_estrategia) values
  ('Rímac',       'RIMAC'),
  ('Pacífico',    'PACIFICO'),
  ('La Positiva', 'LA_POSITIVA'),
  ('Mapfre',      'MAPFRE'),
  ('Qualitas',    'QUALITAS')
on conflict (codigo_estrategia) do nothing;

-- ── Planes (2 por aseguradora) ──────────────────────────────────────────────
insert into svas.plan (aseguradora_id, nombre, descripcion)
select a.id, p.nombre, p.descripcion
  from (values
    ('RIMAC', 'Plata',
     'Cubre daños propios por choque, incendio y desastres naturales, robo total y responsabilidad civil, con auxilio mecánico. Plan de entrada: sin lunas, autopartes ni servicios de reemplazo.'),
    ('RIMAC', 'Oro',
     'Todo lo de Plata más lunas, autopartes, chofer y vehículo de reemplazo, asistencia legal y países vecinos, con límites más altos.'),
    ('PACIFICO', 'Básico',
     'Protege ante choque, incendio y robo total, con responsabilidad civil y auxilio limitado. No incluye desastres naturales, lunas ni ocupantes.'),
    ('PACIFICO', 'Premium',
     'Incluye las 13 coberturas del catálogo: daños propios, robo total y de autopartes, responsabilidad civil alta, ocupantes, asistencia ilimitada, chofer y vehículo de reemplazo, asistencia legal y países vecinos.'),
    ('LA_POSITIVA', 'Clásico',
     'Cubre choque, incendio, desastres, lunas, robo total, responsabilidad civil y ocupantes, con auxilio y orientación legal telefónica. No cubre autopartes ni servicios de reemplazo.'),
    ('LA_POSITIVA', 'Full',
     'Las 13 coberturas, con vehículo de reemplazo hasta 20 días, abogado en comisaría y países vecinos.'),
    ('MAPFRE', 'Esencial',
     'Choque, incendio, robo total y responsabilidad civil, con auxilio limitado. No cubre desastres, lunas, autopartes ni ocupantes.'),
    ('MAPFRE', 'Total',
     'Suma desastres, lunas, autopartes, ocupantes, chofer y vehículo de reemplazo. No incluye asistencia legal ni cobertura fuera del Perú.'),
    ('QUALITAS', 'Estándar',
     'Choque, incendio, desastres, robo total, responsabilidad civil, ocupantes y auxilio. No cubre lunas, autopartes ni servicios de reemplazo.'),
    ('QUALITAS', 'Plus',
     'Suma lunas, autopartes, auxilio ilimitado, chofer, vehículo de reemplazo y orientación legal. No incluye cobertura fuera del Perú.')
  ) as p (codigo, nombre, descripcion)
  join svas.aseguradora a on a.codigo_estrategia = p.codigo
on conflict on constraint uq_plan_aseguradora_nombre do nothing;

-- ── Reglas de inspección (5 × 3 usos) ───────────────────────────────────────
insert into svas.regla_inspeccion (aseguradora_id, uso, requiere_inspeccion)
select a.id, u.uso, u.uso = 'TRANSPORTE_PASAJEROS'
  from svas.aseguradora a
 cross join unnest(enum_range(null::svas.uso_vehiculo)) as u (uso)
on conflict on constraint uq_regla_aseguradora_uso do nothing;

-- ── Campos requeridos ───────────────────────────────────────────────────────
insert into svas.campo_requerido (aseguradora_id, nombre, tipo, obligatorio, origen_valores)
select a.id, c.nombre, c.tipo::svas.tipo_campo, c.obligatorio, c.origen
  from (values
    -- comunes a las 5
    ('RIMAC',       'marca',  'LISTA', true,  'CATALOGO'),
    ('RIMAC',       'modelo', 'LISTA', true,  'CATALOGO'),
    ('RIMAC',       'anio',   'LISTA', true,  'CATALOGO'),
    ('PACIFICO',    'marca',  'LISTA', true,  'CATALOGO'),
    ('PACIFICO',    'modelo', 'LISTA', true,  'CATALOGO'),
    ('PACIFICO',    'anio',   'LISTA', true,  'CATALOGO'),
    ('LA_POSITIVA', 'marca',  'LISTA', true,  'CATALOGO'),
    ('LA_POSITIVA', 'modelo', 'LISTA', true,  'CATALOGO'),
    ('LA_POSITIVA', 'anio',   'LISTA', true,  'CATALOGO'),
    ('MAPFRE',      'marca',  'LISTA', true,  'CATALOGO'),
    ('MAPFRE',      'modelo', 'LISTA', true,  'CATALOGO'),
    ('MAPFRE',      'anio',   'LISTA', true,  'CATALOGO'),
    ('QUALITAS',    'marca',  'LISTA', true,  'CATALOGO'),
    ('QUALITAS',    'modelo', 'LISTA', true,  'CATALOGO'),
    ('QUALITAS',    'anio',   'LISTA', true,  'CATALOGO'),
    -- propios de cada fórmula
    ('PACIFICO',    'ubigeo', 'LISTA', true,  'CATALOGO'),
    ('LA_POSITIVA', 'tipo',   'LISTA', true,  'CATALOGO'),
    -- opcionales
    ('RIMAC',       'placa',  'TEXTO', false, 'ESTATICO'),
    ('PACIFICO',    'placa',  'TEXTO', false, 'ESTATICO'),
    ('MAPFRE',      'placa',  'TEXTO', false, 'ESTATICO'),
    ('LA_POSITIVA', 'clase',  'LISTA', false, 'ESTATICO'),
    ('QUALITAS',    'clase',  'LISTA', false, 'ESTATICO')
  ) as c (codigo, nombre, tipo, obligatorio, origen)
  join svas.aseguradora a on a.codigo_estrategia = c.codigo
on conflict on constraint uq_campo_aseguradora_nombre do nothing;

-- ── Valores permitidos (clase de vehículo, 3 × 2) ───────────────────────────
insert into svas.valor_permitido (campo_requerido_id, valor)
select c.id, v.valor
  from svas.campo_requerido c
  join svas.aseguradora a on a.id = c.aseguradora_id
 cross join (values ('Automóvil'), ('Camioneta'), ('Station wagon')) as v (valor)
 where c.nombre = 'clase' and a.codigo_estrategia in ('LA_POSITIVA', 'QUALITAS')
on conflict on constraint uq_valor_por_campo do nothing;

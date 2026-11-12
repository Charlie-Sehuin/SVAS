-- 0026 · Prueba de Choque (D-★): 8 tablas + RLS
-- Fuente: contexto §4.1 "Prueba de Choque", §5 (RN-28..RN-37), §13.5, §13.6, §16.
-- El doc la ubica en 0011; se numera después de las ya aplicadas (0025).
--
-- Catálogo (escenarios, coberturas, frecuencias, zonas, factores): lo lee el
-- backend con service_role para calcular (igual que las tarifas); con JWT,
-- todos ven los escenarios activos y solo el ADMINISTRADOR el resto.
-- Simulaciones: escritura solo vía RPC (0028). authenticated nunca lee
-- simulacion.perfil (ingreso diario y preocupaciones, RN-36).

-- ── Catálogo ────────────────────────────────────────────────────────────────
create table svas.escenario_siniestro (
  id                     uuid primary key default gen_random_uuid(),
  codigo                 varchar(30)   not null,
  nombre                 varchar(80)   not null,
  descripcion            text          not null,
  -- NULL en ROBO_TOTAL y PERDIDA_TOTAL: el daño es la suma asegurada del plan (§16.2).
  monto_dano_referencial numeric(12,2) null,
  dias_taller_estimados  smallint      not null default 0,
  orden                  smallint      not null default 0,
  activo                 boolean       not null default true,
  constraint uq_escenario_codigo unique (codigo),
  constraint ck_escenario_codigo check (codigo ~ '^[A-Z][A-Z_]{1,29}$'),
  constraint ck_escenario_textos check (btrim(nombre) <> '' and btrim(descripcion) <> ''),
  constraint ck_escenario_monto check (monto_dano_referencial is null or monto_dano_referencial > 0),
  constraint ck_escenario_dias  check (dias_taller_estimados between 0 and 365)
);

create table svas.cobertura_plan_escenario (
  id                  uuid primary key default gen_random_uuid(),
  plan_id             uuid                  not null references svas.plan (id) on delete restrict,
  escenario_id        uuid                  not null references svas.escenario_siniestro (id) on delete restrict,
  cubre               boolean               not null,
  deducible_pct       numeric(5,2)          null,
  deducible_minimo    numeric(12,2)         null,
  tope_cobertura      numeric(12,2)         null,   -- null = hasta la suma asegurada
  condicion_taller    svas.condicion_taller not null default 'CUALQUIERA',
  dias_auto_reemplazo smallint              not null default 0,
  fuente              varchar(200)          not null,
  actualizado_en      timestamptz           not null default now(),
  constraint uq_cobertura_plan_escenario unique (plan_id, escenario_id),
  -- Si no cubre, no hay deducible, tope ni reemplazo.
  constraint ck_cobertura_coherente check (
    cubre
    or (deducible_pct is null and deducible_minimo is null
        and tope_cobertura is null and dias_auto_reemplazo = 0)
  ),
  constraint ck_cobertura_valores check (
    (deducible_pct is null or deducible_pct between 0 and 100)
    and (deducible_minimo is null or deducible_minimo >= 0)
    and (tope_cobertura is null or tope_cobertura > 0)
    and dias_auto_reemplazo between 0 and 365
    and btrim(fuente) <> ''
  )
);

create index ix_cobertura_escenario on svas.cobertura_plan_escenario (escenario_id);

create table svas.frecuencia_escenario (
  id                 uuid primary key default gen_random_uuid(),
  escenario_id       uuid              not null references svas.escenario_siniestro (id) on delete restrict,
  uso                svas.uso_vehiculo not null,
  zona               svas.zona_riesgo  not null,
  probabilidad_anual numeric(6,4)      not null,
  constraint uq_frecuencia_escenario_uso_zona unique (escenario_id, uso, zona),
  constraint ck_frecuencia_probabilidad check (probabilidad_anual > 0 and probabilidad_anual < 1)
);

-- Ubigeo sin fila → zona MEDIA (§4.1).
create table svas.zona_riesgo_distrito (
  id     uuid primary key default gen_random_uuid(),
  ubigeo char(6)          not null references svas.ubigeo (codigo) on delete restrict,
  zona   svas.zona_riesgo not null,
  constraint uq_zona_ubigeo unique (ubigeo)
);

create table svas.factor_perfil (
  id            uuid primary key default gen_random_uuid(),
  escenario_id  uuid                 not null references svas.escenario_siniestro (id) on delete restrict,
  variable      svas.variable_perfil not null,
  multiplicador numeric(4,2)         not null,
  constraint uq_factor_escenario_variable unique (escenario_id, variable),
  constraint ck_factor_multiplicador check (multiplicador between 0.10 and 3.00)
);

-- ── Simulaciones ────────────────────────────────────────────────────────────
create table svas.simulacion (
  id             uuid primary key default gen_random_uuid(),
  cotizacion_id  uuid             not null references svas.cotizacion (id) on delete cascade,
  perfil         jsonb            not null,
  zona           svas.zona_riesgo not null,
  fecha          timestamptz      not null default now(),
  version_reglas varchar(20)      not null,
  -- false si el cliente cambió su suma asegurada después de simular (RN-37, §13.6).
  vigente        boolean          not null default true,
  constraint ck_simulacion_perfil check (jsonb_typeof(perfil) = 'object')
);

create index ix_simulacion_cotizacion on svas.simulacion (cotizacion_id, fecha desc);
create index ix_simulacion_vigente on svas.simulacion (cotizacion_id) where vigente;

-- Instantánea: los valores se copian, nunca se recalculan (RN-32).
create table svas.simulacion_resultado (
  id                 uuid primary key default gen_random_uuid(),
  simulacion_id      uuid          not null references svas.simulacion (id) on delete cascade,
  prima_cotizada_id  uuid          not null references svas.prima_cotizada (id) on delete cascade,
  escenario_id       uuid          not null references svas.escenario_siniestro (id) on delete restrict,
  sin_dato           boolean       not null default false,   -- RN-30
  cubre              boolean       null,                     -- null si sin_dato
  probabilidad_usada numeric(6,4)  not null,
  monto_dano_usado   numeric(12,2) not null,
  monto_cubierto     numeric(12,2) not null,
  deducible_aplicado numeric(12,2) not null,
  no_cubierto        numeric(12,2) not null,
  ingreso_perdido    numeric(12,2) not null,
  desembolso_cliente numeric(12,2) not null,
  constraint uq_simulacion_resultado unique (simulacion_id, prima_cotizada_id, escenario_id),
  constraint ck_resultado_montos check (
    probabilidad_usada >= 0 and probabilidad_usada < 1
    and monto_dano_usado >= 0 and monto_cubierto >= 0 and deducible_aplicado >= 0
    and no_cubierto >= 0 and ingreso_perdido >= 0 and desembolso_cliente >= 0
  ),
  constraint ck_resultado_sin_dato check (sin_dato = (cubre is null))
);

create index ix_resultado_prima on svas.simulacion_resultado (prima_cotizada_id);
create index ix_resultado_escenario on svas.simulacion_resultado (escenario_id);

create table svas.simulacion_plan (
  id                uuid primary key default gen_random_uuid(),
  simulacion_id     uuid          not null references svas.simulacion (id) on delete cascade,
  prima_cotizada_id uuid          not null references svas.prima_cotizada (id) on delete cascade,
  costo_real_anual  numeric(12,2) not null,
  peor_caso         numeric(12,2) not null,
  ranking           smallint      not null,
  datos_completos   boolean       not null,
  constraint uq_simulacion_plan unique (simulacion_id, prima_cotizada_id),
  constraint uq_simulacion_ranking unique (simulacion_id, ranking),
  constraint ck_simulacion_plan check (costo_real_anual >= 0 and peor_caso >= 0 and ranking >= 1)
);

create index ix_simulacion_plan_prima on svas.simulacion_plan (prima_cotizada_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table svas.escenario_siniestro      enable row level security;
alter table svas.cobertura_plan_escenario enable row level security;
alter table svas.frecuencia_escenario     enable row level security;
alter table svas.zona_riesgo_distrito     enable row level security;
alter table svas.factor_perfil            enable row level security;
alter table svas.simulacion               enable row level security;
alter table svas.simulacion_resultado     enable row level security;
alter table svas.simulacion_plan          enable row level security;

create policy escenario_select on svas.escenario_siniestro
  for select to authenticated
  using (activo or (select svas.rol_actual()) = 'ADMINISTRADOR');

create policy cobertura_pe_select on svas.cobertura_plan_escenario
  for select to authenticated using ((select svas.rol_actual()) = 'ADMINISTRADOR');
create policy frecuencia_select on svas.frecuencia_escenario
  for select to authenticated using ((select svas.rol_actual()) = 'ADMINISTRADOR');
create policy zona_select on svas.zona_riesgo_distrito
  for select to authenticated using ((select svas.rol_actual()) = 'ADMINISTRADOR');
create policy factor_select on svas.factor_perfil
  for select to authenticated using ((select svas.rol_actual()) = 'ADMINISTRADOR');

-- Dueño, asesor del caso o admin (mismo helper que la cotización).
create policy simulacion_select on svas.simulacion
  for select to authenticated using (svas.puede_ver_cotizacion(cotizacion_id));
create policy simulacion_resultado_select on svas.simulacion_resultado
  for select to authenticated
  using (exists (select 1 from svas.simulacion s
                  where s.id = simulacion_id and svas.puede_ver_cotizacion(s.cotizacion_id)));
create policy simulacion_plan_select on svas.simulacion_plan
  for select to authenticated
  using (exists (select 1 from svas.simulacion s
                  where s.id = simulacion_id and svas.puede_ver_cotizacion(s.cotizacion_id)));

-- ── Permisos ────────────────────────────────────────────────────────────────
revoke all on svas.escenario_siniestro, svas.cobertura_plan_escenario, svas.frecuencia_escenario,
              svas.zona_riesgo_distrito, svas.factor_perfil, svas.simulacion,
              svas.simulacion_resultado, svas.simulacion_plan
  from public, anon, authenticated;

grant select on svas.escenario_siniestro, svas.cobertura_plan_escenario, svas.frecuencia_escenario,
                svas.zona_riesgo_distrito, svas.factor_perfil,
                svas.simulacion_resultado, svas.simulacion_plan
  to authenticated;
grant select (id, cotizacion_id, zona, fecha, version_reglas, vigente)
  on svas.simulacion to authenticated;

grant select on svas.escenario_siniestro, svas.cobertura_plan_escenario, svas.frecuencia_escenario,
                svas.zona_riesgo_distrito, svas.factor_perfil, svas.simulacion,
                svas.simulacion_resultado, svas.simulacion_plan
  to service_role;

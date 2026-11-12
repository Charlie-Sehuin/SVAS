-- 0003 · Bitácora append-only
-- Fuente: contexto §4.1 (Trazabilidad) y §7 (solo ADMINISTRADOR lee)

create table svas.registro_actividad (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid null references svas.usuario (id) on delete restrict, -- null = acción del sistema
  accion      varchar(60) not null,
  entidad     varchar(40) not null,
  entidad_id  uuid null,
  detalle     jsonb null,                                                 -- antes/después en cambios de catálogo
  fecha       timestamptz not null default now()
);

create index ix_registro_actividad_usuario on svas.registro_actividad (usuario_id);
create index ix_registro_actividad_entidad on svas.registro_actividad (entidad, entidad_id);
create index ix_registro_actividad_fecha   on svas.registro_actividad (fecha desc);

-- ── Append-only ─────────────────────────────────────────────────────────────
-- Además de no dar grants de UPDATE/DELETE, un trigger lo bloquea para
-- cualquier rol (incluido service_role).
create or replace function svas.fn_registro_actividad_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'registro_actividad es de solo inserción'
    using errcode = '42501';
end;
$$;

create trigger tg_registro_actividad_inmutable
before update or delete on svas.registro_actividad
for each row execute function svas.fn_registro_actividad_inmutable();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table svas.registro_actividad enable row level security;

create policy registro_actividad_select_admin on svas.registro_actividad
  for select to authenticated
  using (svas.rol_actual() = 'ADMINISTRADOR');

-- Las inserciones las hacen los RPCs (SECURITY DEFINER) o el backend con service_role.
revoke all on svas.registro_actividad from public, anon, authenticated;
grant select on svas.registro_actividad to authenticated;
grant select, insert on svas.registro_actividad to service_role;

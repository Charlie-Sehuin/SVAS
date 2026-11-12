-- 0001 · Esquema svas, extensiones y los 19 tipos enum
-- Fuente: contexto-dominio-seguro-simple.md §4 y §4.2

create schema if not exists svas;

-- pgcrypto (gen_random_uuid, digest para hashes de tokens). En Supabase vive en "extensions".
create extension if not exists pgcrypto with schema extensions;

-- Acceso al esquema: anon NO tiene grants (el frontend solo habla con Auth;
-- los flujos anónimos pasan por el backend con service_role).
revoke all on schema svas from public;
revoke all on schema svas from anon;
grant usage on schema svas to authenticated, service_role;

-- Las funciones nuevas en svas no se ejecutan por defecto desde PUBLIC:
-- cada RPC declara explícitamente a quién se le da EXECUTE.
alter default privileges in schema svas revoke execute on functions from public;

-- ── Enumeraciones (16 de la Práctica 2 + 3 de la Prueba de Choque) ──────────
create type svas.rol                as enum ('CLIENTE', 'ASESOR', 'ADMINISTRADOR');
create type svas.uso_vehiculo       as enum ('PARTICULAR', 'COMERCIAL_LIGERO', 'TRANSPORTE_PASAJEROS');
create type svas.canal_contacto     as enum ('LLAMADA', 'WHATSAPP');
create type svas.estado_cotizacion  as enum ('REGISTRADA', 'CONVERTIDA', 'NO_CONCRETADA');
create type svas.opcion_venta       as enum ('COMPRA_INMEDIATA', 'ASESORIA');
create type svas.motivo_asesoria    as enum ('DUDA', 'NEGOCIACION', 'DESCUENTO', 'INSPECCION', 'NO_ASEGURABLE');
create type svas.origen_caso        as enum ('SISTEMA', 'CLIENTE');
create type svas.estado_solicitud   as enum ('PENDIENTE', 'EN_ATENCION', 'CERRADA');
create type svas.tipo_descuento     as enum ('PRIMERA_COMPRA', 'NEGOCIADO');
create type svas.estado_seguimiento as enum ('EN_SEGUIMIENTO', 'CONVERTIDO', 'DESCARTADO');
create type svas.motivo_cierre      as enum ('PRECIO', 'YA_CONTRATO', 'NO_RESPONDE', 'SIN_INTERES', 'OTRO');
create type svas.resultado_intento  as enum ('CONTACTADO', 'NO_RESPONDE', 'RECHAZA', 'ACEPTA');
create type svas.modo_pago          as enum ('UNICO', 'CUOTAS');
create type svas.estado_pago        as enum ('PENDIENTE', 'CONFIRMADO', 'RECHAZADO');
create type svas.canal_venta        as enum ('AUTONOMO', 'ASESORIA', 'TELEMARKETING');
create type svas.tipo_campo         as enum ('TEXTO', 'NUMERO', 'LISTA');
create type svas.zona_riesgo        as enum ('ALTA', 'MEDIA', 'BAJA');
create type svas.condicion_taller   as enum ('AFILIADO', 'CUALQUIERA');
create type svas.variable_perfil    as enum ('ESTACIONA_COCHERA', 'KM_MES_ALTO', 'USO_NOCTURNO');

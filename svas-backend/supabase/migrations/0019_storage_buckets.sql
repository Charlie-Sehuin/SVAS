-- 0019 · Bucket privado "polizas" y su policy
-- Fuente: contexto §3.6 / §9; backend §6 (GeneradorPdf → Storage, ruta polizas/<poliza_id>.pdf)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('polizas', 'polizas', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

-- Subida y URLs firmadas: solo el backend con service_role (no le aplica RLS).
-- El CLIENTE descarga su PDF vía GET /polizas/:id/pdf, que valida la propiedad
-- y devuelve una URL firmada; nunca accede al bucket directamente.
-- Aquí solo se permite la lectura directa al ADMINISTRADOR.
create policy polizas_select_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'polizas' and svas.rol_actual() = 'ADMINISTRADOR');

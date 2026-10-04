-- =====================================================================
-- 0500: armazenamento privado dos documentos das licenças
-- Caminho: {company_id}/{company_license_id}/{uuid}-{arquivo}
-- Sem políticas de UPDATE/DELETE: arquivos enviados são preservados.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('license-documents', 'license-documents', false, 20971520, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy license_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'license-documents' and public.is_member());

create policy license_documents_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'license-documents' and public.is_staff());

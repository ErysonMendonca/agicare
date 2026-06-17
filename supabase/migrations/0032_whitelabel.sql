-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0032: White-label (Supabase Storage para logos).
--
-- O tema/paleta/logo já persistem em public.clinic_settings.branding (JSONB,
-- migration 0025) — NENHUMA coluna nova é necessária. Esta migration apenas
-- provisiona o STORAGE para hospedar o logotipo da clínica como arquivo
-- (em vez de data URL no JSONB):
--   - bucket público "clinic-assets"
--   - policies em storage.objects: leitura pública; escrita restrita a
--     membros autenticados, isolada por pasta = clinic_id (multitenant 0021).
--
-- Depende de 0021 (current_clinic_id()) quando multitenant está provisionado.
-- Em mono-clínica, a checagem por pasta usa o id da clínica padrão no caminho.
-- Idempotente (on conflict / drop policy if exists).
-- ════════════════════════════════════════════════════════════════

-- 1) Bucket público de assets da clínica ----------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinic-assets',
  'clinic-assets',
  true,
  524288, -- 512 KB
  array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) RLS em storage.objects (já habilitada por padrão no Supabase) ---------

-- Leitura: pública (bucket público — assets de marca não são sensíveis).
drop policy if exists "clinic_assets_public_read" on storage.objects;
create policy "clinic_assets_public_read"
  on storage.objects for select
  using (bucket_id = 'clinic-assets');

-- Escrita (insert/update/delete): apenas STAFF (admin/medico/recepcao), e
-- somente dentro da pasta da PRÓPRIA clínica (1º segmento = clinic_id). O
-- is_staff() impede que um membro não-staff (ex.: paciente autenticado) faça
-- defacement do logo. A confirmação de gestor p/ upload é no servidor
-- (branding.ts uploadLogo). Usa current_clinic_id()/is_staff() (0020/0021).
drop policy if exists "clinic_assets_member_insert" on storage.objects;
create policy "clinic_assets_member_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'clinic-assets'
    and public.is_staff()
    and (storage.foldername(name))[1] = current_clinic_id()::text
  );

drop policy if exists "clinic_assets_member_update" on storage.objects;
create policy "clinic_assets_member_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'clinic-assets'
    and public.is_staff()
    and (storage.foldername(name))[1] = current_clinic_id()::text
  )
  with check (
    bucket_id = 'clinic-assets'
    and public.is_staff()
    and (storage.foldername(name))[1] = current_clinic_id()::text
  );

drop policy if exists "clinic_assets_member_delete" on storage.objects;
create policy "clinic_assets_member_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'clinic-assets'
    and public.is_staff()
    and (storage.foldername(name))[1] = current_clinic_id()::text
  );

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   drop policy if exists "clinic_assets_public_read"   on storage.objects;
--   drop policy if exists "clinic_assets_member_insert" on storage.objects;
--   drop policy if exists "clinic_assets_member_update" on storage.objects;
--   drop policy if exists "clinic_assets_member_delete" on storage.objects;
--   delete from storage.buckets where id = 'clinic-assets';
-- ════════════════════════════════════════════════════════════════

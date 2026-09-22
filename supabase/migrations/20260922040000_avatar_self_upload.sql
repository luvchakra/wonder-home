-- The other half of letting a member edit their own profile
-- (20260922010000): the `avatars` bucket's own storage.objects policies
-- were admin-only (`avatars_insert_admin`/`_update_admin`/`_delete_admin`),
-- so relaxing `household_members` RLS alone still left a self-upload
-- failing with a storage 403 the moment a member tried to change their own
-- photo. These mirror the admin ones, scoped to the object whose path's
-- second segment — the member id — is the caller's own
-- (`avatarStoragePath` in household-actions.ts writes exactly
-- `<household_id>/<member_id>`, no filename beyond that).

create policy "avatars_insert_self"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 2) = wh.member_id(((storage.foldername(name))[1])::uuid)::text
  );

create policy "avatars_update_self"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 2) = wh.member_id(((storage.foldername(name))[1])::uuid)::text
  )
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 2) = wh.member_id(((storage.foldername(name))[1])::uuid)::text
  );

create policy "avatars_delete_self"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 2) = wh.member_id(((storage.foldername(name))[1])::uuid)::text
  );

notify pgrst, 'reload schema';

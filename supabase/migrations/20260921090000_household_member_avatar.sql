-- A profile picture for a household member (story 01-004 follow-up).
--
-- Lives on household_members, not profiles: a child or a househelper with no
-- account of their own (profile_id null) still needs a photo, the same
-- reason nickname/relationship/occupation landed here rather than on
-- profiles in the prior migration.
--
-- `avatar_path` stores an opaque storage object path
-- ("<household_id>/<member_id>", one object per member, overwritten on
-- every re-upload), never a URL — the bucket is private, so a signed URL is
-- minted server-side at read time (listMembers in identity/households.ts)
-- rather than handed out once and cached, keeping it short-lived and keyed
-- to a caller who still passes the storage policies below.
--
-- Path convention doubles as the authorization boundary: the first folder
-- segment is the household id, so wh.is_member()/wh.is_household_admin()
-- (already SECURITY DEFINER, already granted to authenticated) can gate
-- storage.objects directly without a new helper function.

alter table public.household_members
  add column avatar_path text;

comment on column public.household_members.avatar_path is
  'Storage object path in the private "avatars" bucket, or null. Never a URL — read paths mint a short-lived signed URL.';

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

-- storage.objects already ships with row level security enabled and is
-- owned by supabase_storage_admin — this migration's role can create
-- policies on it (the documented, supported pattern) but cannot re-run
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY on it, so that statement is
-- deliberately not repeated here.

create policy "avatars_select_household_member"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and wh.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy "avatars_insert_admin"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and wh.is_household_admin(((storage.foldername(name))[1])::uuid)
  );

create policy "avatars_update_admin"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and wh.is_household_admin(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'avatars'
    and wh.is_household_admin(((storage.foldername(name))[1])::uuid)
  );

create policy "avatars_delete_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and wh.is_household_admin(((storage.foldername(name))[1])::uuid)
  );

notify pgrst, 'reload schema';

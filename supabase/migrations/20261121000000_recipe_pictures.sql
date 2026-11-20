-- A household recipe's own picture (HomeFood 25-050; the owner, 2026-11-20:
-- "add option to add a picture").
--
-- Safe in either order with the code: until this runs, the recipes read
-- without `image_path` (the reader retries without it) and a picture is
-- skipped while the recipe still saves.
--
-- The picture lives in the private `avatars` bucket at
-- <household>/recipes/<recipe id>, like grocery item photos; every member
-- already reads that bucket's household folder. Writing follows who may
-- change a recipe (`recipes_write_member`): any member of the household.
-- Set-form membership checks only (no per-row helper).

alter table public.recipes
  add column if not exists image_path text
    check (image_path is null or length(image_path) <= 200);

drop policy if exists "avatars_recipe_insert_member" on storage.objects;
create policy "avatars_recipe_insert_member"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[2] = 'recipes'
    and (storage.foldername(name))[1] in (select h::text from wh.member_households() as h)
  );

drop policy if exists "avatars_recipe_update_member" on storage.objects;
create policy "avatars_recipe_update_member"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[2] = 'recipes'
    and (storage.foldername(name))[1] in (select h::text from wh.member_households() as h)
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[2] = 'recipes'
    and (storage.foldername(name))[1] in (select h::text from wh.member_households() as h)
  );

drop policy if exists "avatars_recipe_delete_member" on storage.objects;
create policy "avatars_recipe_delete_member"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[2] = 'recipes'
    and (storage.foldername(name))[1] in (select h::text from wh.member_households() as h)
  );

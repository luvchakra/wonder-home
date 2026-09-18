-- When each member first signed in (household setup guidance).
--
-- Applied to the wonder-home Supabase project as version 20260918050000.
--
-- The Head of Family and administrators are shown a "set up your household"
-- section prominently for their first week. A week from when? From the first
-- time that person actually signed in — not from when the household was
-- created, because an administrator invited a month later still deserves
-- their week. So the moment is recorded per member, once, by the server.

alter table public.household_members
  add column first_seen_at timestamptz;

comment on column public.household_members.first_seen_at is
  'The first time this member signed in. Set once by wh/mark_member_seen; never edited.';

-- The member's own row is not writable by the member (household_members_update_admin),
-- and the first-seen moment must not be editable by anyone, so it is set
-- through a definer function that only ever fills an empty value.
create or replace function public.mark_member_seen(p_household_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seen timestamptz;
begin
  update public.household_members
  set first_seen_at = coalesce(first_seen_at, now())
  where household_id = p_household_id
    and profile_id = (select auth.uid())
    and status = 'active'
  returning first_seen_at into v_seen;

  return v_seen;
end;
$$;

comment on function public.mark_member_seen is
  'Records the caller''s first sign-in to a household, once. Idempotent; returns the recorded moment.';

revoke all on function public.mark_member_seen(uuid) from public, anon;
grant execute on function public.mark_member_seen(uuid) to authenticated;

notify pgrst, 'reload schema';

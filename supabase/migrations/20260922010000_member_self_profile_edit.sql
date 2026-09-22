-- A member editing their own profile (product feedback: "for logged in user
-- profile, they should have option to change their details, also change
-- their profile picture").
--
-- Every write to `household_members` has been Admin-only since the identity
-- module shipped (`household_members_update_admin`) — deliberately, per the
-- comment this migration removes from `updateMemberProfile`'s own doc
-- comment: "there is no self-edit path yet, so this does not open one."
-- This is that path, opened carefully rather than broadly.
--
-- A plain "a member may update their own row" RLS policy would not be
-- enough by itself: Supabase grants `authenticated` table-wide privileges
-- and leaves RLS as the only gate, so a permissive row policy with no
-- column restriction would let a member reach columns nothing about "edit
-- my own details" should ever touch — `member_type` (become an adult),
-- `status` (reactivate a suspended/invited row), `household_id` (move
-- themselves to a different household) or `profile_id` (relink the row to
-- a different account) — straight from a raw PostgREST call, bypassing the
-- app's own field whitelist in `updateMemberProfile` entirely. Postgres
-- column-level grants cannot narrow this back down once a table-wide grant
-- already exists (grants are additive), so the guard has to be a trigger
-- that inspects what actually changed, the same way `wh.assert_owner_is_head`
-- and friends already guard other invariants on this table.

-- Only guards the specific case the new self policy opens: the caller's own
-- request-scoped membership (`wh.member_id`, which reads `auth.uid()`)
-- resolves to *this* row, and that caller is not an Admin. Any other write
-- path — an Admin editing anyone including themselves, `wh.accept_invitation`
-- and every other SECURITY DEFINER function linking/reactivating a member on
-- the system's behalf, a service-role or raw superuser connection with no
-- `auth.uid()` at all (test fixtures, ops scripts) — resolves `wh.member_id`
-- to null or to a different row and passes straight through untouched,
-- exactly as before this migration.
create or replace function wh.guard_member_self_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id = wh.member_id(new.household_id) and not wh.is_household_admin(new.household_id) then
    if new.household_id is distinct from old.household_id
      or new.member_type is distinct from old.member_type
      or new.status is distinct from old.status
      or new.profile_id is distinct from old.profile_id
    then
      raise exception 'Only an Admin can change a member''s household, type, status or account link.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

comment on function wh.guard_member_self_update() is
  'Lets a member update their own household_members row (via the new self policy below) while keeping household_id/member_type/status/profile_id Admin-only, without touching any write path where new.id is not the caller''s own resolvable membership.';

create trigger household_members_guard_self_update
  before update on public.household_members
  for each row execute function wh.guard_member_self_update();

create policy household_members_update_self
  on public.household_members for update
  to authenticated
  using (id = wh.member_id(household_id))
  with check (id = wh.member_id(household_id));

notify pgrst, 'reload schema';

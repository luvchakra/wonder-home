-- Each sharer chooses their own audience (the owner, 2026-10-29: "Make it
-- configurable if family's children can see the location online"). When
-- sharing is on, the sharer picks who may see it: the family's adults only
-- (the default, today's behaviour) or the adults *and* the children too.
-- Adults always see; a child sees a person's position only if that person
-- opted in.
--
-- `visible_to_children` defaults false, so nothing changes until someone turns
-- it on. Safe in either order: before this migration there is no column and
-- the read is adults-only; after it, every existing row is false and the read
-- is still adults-only until a sharer opts in. Who may set the choice is the
-- same rule as turning sharing on — an adult or helper for themselves, a
-- child's guardian or an Admin for the child (`wh.may_set_location_sharing`,
-- enforced by the unchanged write policy).
--
-- Rollback: alter table public.member_location_sharing drop column visible_to_children;
--           then recreate member_locations_read without the child branch.

alter table public.member_location_sharing
  add column if not exists visible_to_children boolean not null default false;

comment on column public.member_location_sharing.visible_to_children is
  'Whether the family''s children may also see this member''s position. Off by default: only the household''s adults see it until the sharer (or a child''s guardian/Admin) turns this on.';

comment on table public.member_location_sharing is
  'Whether a member shares where they are, and with whom. Off unless turned on, by the adult themselves or for a child by their guardian or an Admin. Shared positions are seen by the household''s adults, and by the children too only when visible_to_children is on.';

-- Read visibility. Self and the household's adults are unchanged. A child of
-- the household may now read a member's position, but only when that member is
-- sharing AND chose to let the children see it. Helpers are unchanged (self
-- only). Set forms only; no per-row helper (`scripts/test-setup-counts-rls.mjs`).
-- The child branch keys the sharing lookup on member_id (its primary key), so
-- no new index is needed; `member_location_sharing_household_idx` already
-- covers the household scan.
drop policy if exists member_locations_read on public.member_locations;
create policy member_locations_read on public.member_locations for select
  to authenticated
  using (
    -- The member themselves.
    (household_id, member_id) in (select household_id, member_id from wh.my_memberships())
    -- The household's adults, exactly as before.
    or exists (
      select 1 from public.household_members me
      where me.household_id = member_locations.household_id
        and me.profile_id = (select auth.uid())
        and me.member_type = 'adult'
        and me.status = 'active'
    )
    -- A child of the household, only for members who opted the children in.
    or (
      exists (
        select 1 from public.household_members kid
        where kid.household_id = member_locations.household_id
          and kid.profile_id = (select auth.uid())
          and kid.member_type = 'child'
          and kid.status = 'active'
      )
      and exists (
        select 1 from public.member_location_sharing s
        where s.member_id = member_locations.member_id
          and s.household_id = member_locations.household_id
          and s.enabled
          and s.visible_to_children
      )
    )
  );

notify pgrst, 'reload schema';

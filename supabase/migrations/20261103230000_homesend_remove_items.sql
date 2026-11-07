-- HomeSend: remove one item on its own (the owner, 2026-11-03).
--
-- 1. `removed_by_person` joins the reasons an item can be archived for: a
--    person swiped it away or pressed Remove. It is archived (Restore undoes
--    it), never deleted.
-- 2. "Delete for good" in the Archived view hard-deletes an archived item.
--    There was no DELETE policy, so none was possible; this adds one, for an
--    Admin or the item's own sender, archived items only. The stored file goes
--    through the bucket's own delete policy (any household member, by path);
--    the app checks Admin-or-sender before it asks for either.
--
-- Safe in either order: purely additive. Old code never writes the new reason;
-- new code run before this fails the one remove, and nothing else.
-- Rollback: restore the previous check list; drop policy home_send_items_delete_archived.

alter table public.home_send_items drop constraint if exists home_send_items_archive_reason_check;
alter table public.home_send_items add constraint home_send_items_archive_reason_check
  check (archive_reason is null or archive_reason in ('untouched_30_days', 'past_date', 'already_recorded', 'superseded', 'cancelled', 'unreadable', 'removed_by_person'));

comment on column public.home_send_items.archive_reason is
  'Why it was archived: untouched_30_days (the 30-day sweep), the daily tidy''s past_date, already_recorded, superseded, cancelled, unreadable, or removed_by_person. Null when not archived.';

drop policy if exists home_send_items_delete_archived on public.home_send_items;
create policy home_send_items_delete_archived on public.home_send_items for delete
  to authenticated using (
    status = 'archived'
    and (
      household_id in (select wh.admin_households())
      or (household_id, created_by_member_id) in (select household_id, member_id from wh.my_memberships())
    )
  );

notify pgrst, 'reload schema';

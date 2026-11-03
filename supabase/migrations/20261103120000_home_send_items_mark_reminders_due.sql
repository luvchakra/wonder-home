-- A HomeSend item confirmed, undone or dismissed clears its "waiting for your
-- OK" notice before the Notifications screen reads (the owner, 2026-11-03).
--
-- The notice sweep reads public.home_send_items, but the table never moved the
-- household's next check to now, so a confirmed item's notice waited for the
-- next throttled pass. With this trigger, the page load's claim
-- (reconcile.ts `reconcileClaimFilter`) sees the change and runs the pass first.
-- Adds a trigger only; no stored value changes, so it is safe in either order.
--
-- Rollback: drop trigger home_send_items_marks_reminders_due on public.home_send_items.

create or replace trigger home_send_items_marks_reminders_due
  after insert or update of status or delete on public.home_send_items
  for each row execute function wh.mark_reminders_due();

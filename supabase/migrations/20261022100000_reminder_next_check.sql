-- When the delivery clock should next look at a household's reminders (the
-- owner's review, 2026-10-22).
--
-- The five-minute clock used to walk every household with an open reminder.
-- That misses one whose next stage needs a new row (an evening-before
-- reminder the person dismissed, then "this morning"), or a record written
-- inside the page load's five-minute claim; and it reads every household on
-- every tick. Now each reminder pass records `next_due_at`, the next moment
-- anything could change by itself (`nextReminderCheck`: a stage, an expiry,
-- an escalation's wait; never more than six hours away), and the clock takes
-- only the households that are due.
--
-- A write to a record a reminder is made from, a change to who is reminded
-- or how, and a person marking a reminder done or dismissing it, move the
-- household's next check to now. The trigger only ever updates an existing
-- row (one is made by the first page load or the daily sweep), so it never
-- touches a household being deleted; and it only writes a row whose next
-- check is still ahead, so a bulk write costs one update, not one per row.
--
-- Rollback: drop the *_marks_reminders_due triggers, drop function
-- wh.mark_reminders_due(), drop index
-- public.notification_reconciliations_next_due_idx, and drop column
-- public.notification_reconciliations.next_due_at.

alter table public.notification_reconciliations
  add column if not exists next_due_at timestamptz not null default now();

comment on column public.notification_reconciliations.next_due_at is
  'When the delivery clock next takes this household''s reminder pass. Set by each pass (the next stage, expiry or escalation wait), moved to now by wh.mark_reminders_due() when a record a reminder reads changes.';

create index if not exists notification_reconciliations_next_due_idx
  on public.notification_reconciliations (next_due_at);

create or replace function wh.mark_reminders_due() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  target uuid;
begin
  if tg_op = 'DELETE' then
    target := old.household_id;
  else
    target := new.household_id;
  end if;
  if target is not null then
    update public.notification_reconciliations
       set next_due_at = now()
     where household_id = target
       and next_due_at > now();
  end if;
  return null;
end;
$$;

revoke all on function wh.mark_reminders_due() from public, anon, authenticated;

do $tables$
declare
  name text;
begin
  foreach name in array array[
    'obligations', 'school_items', 'meals', 'recipes', 'cart_suggestions', 'pets', 'pet_care_needs', 'family_events',
    'household_members', 'household_roles', 'responsibilities', 'member_guardians',
    'reminder_preferences', 'notification_preferences', 'policies'
  ] loop
    execute format(
      'create or replace trigger %I after insert or update or delete on public.%I for each row execute function wh.mark_reminders_due()',
      name || '_marks_reminders_due', name
    );
  end loop;
end;
$tables$;

-- A person closing a reminder: its next stage, if any, is a new row the next pass makes.
create or replace trigger notifications_marks_reminders_due
  after update of status on public.notifications
  for each row
  when (new.status is distinct from old.status and new.status in ('acted', 'dismissed'))
  execute function wh.mark_reminders_due();

notify pgrst, 'reload schema';

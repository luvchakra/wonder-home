-- HomeSend understands complex messages (2026-11-21, 14-074).
--
-- 1. home_send_items.failure_reason gains 'output_rejected': a model answered,
--    but in a shape WonderHome could not use (the owner's exam timetable was
--    thrown away whole for having more rows than one reading allowed). It is
--    read again more closely, never called "unknown".
-- 2. homesend_changes.domain gains 'school_exam': an exam timetable becomes one
--    school_exams row per child, each linked to its source item, opened from
--    it, marked Checking when read from a photo, and undone with it.
-- 3. Exam days are reminded (notifications/reconcile.ts reads the next few
--    days' papers per household): an index for that read.
--
-- Safe in either order with the code: before this runs, a rejected reading is
-- recorded as 'unreadable' (read again the ordinary way) and an exam's change
-- row is skipped with a warning (the exam itself is written and can be removed
-- on the School page). Old code never writes either new value.
--
-- Rollback: update public.home_send_items set failure_reason = 'unreadable' where failure_reason = 'output_rejected';
-- delete from public.homesend_changes where domain = 'school_exam'; then re-create both checks without the new value
-- (20261121020000 and 20261024140000), and drop index public.school_exam_papers_household_day_idx.

alter table public.home_send_items drop constraint if exists home_send_items_failure_reason_check;
alter table public.home_send_items add constraint home_send_items_failure_reason_check
  check (failure_reason in (
    'security_rejected', 'unsupported_type', 'unreadable', 'too_large',
    'link_blocked', 'link_unreachable', 'transcription_unavailable', 'transcription_failed',
    'model_unavailable', 'output_rejected'
  ));

alter table public.homesend_changes drop constraint if exists homesend_changes_domain_check;
alter table public.homesend_changes
  add constraint homesend_changes_domain_check
  check (domain in ('bill', 'school_item', 'activity_item', 'activity', 'event', 'grocery_item', 'health_document', 'purchase', 'school_exam'));

create index if not exists school_exam_papers_household_day_idx
  on public.school_exam_papers (household_id, on_date)
  where active;

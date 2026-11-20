-- "Who is this for?" (2026-11-20): a waiting health document whose own words
-- don't say it is its sender's is asked about, of the sender only; if nobody
-- answers in 24 hours it is set aside, never filed for anyone, with this reason.
--
-- Safe in either order: before this runs, the archive with the new reason is
-- refused by the old check, so the item simply keeps waiting (never filed) and
-- the next pass tries again; nothing reads the new value but the archive list,
-- which words an unknown reason generically.

alter table public.home_send_items drop constraint if exists home_send_items_archive_reason_check;
alter table public.home_send_items add constraint home_send_items_archive_reason_check
  check (archive_reason is null or archive_reason in (
    'untouched_30_days', 'past_date', 'already_recorded', 'superseded', 'cancelled', 'unreadable', 'removed_by_person',
    'not_household', 'kept_as_note', 'not_resent', 'health_not_claimed',
    'new_sender', 'sender_blocked', 'sender_not_answered'
  ));

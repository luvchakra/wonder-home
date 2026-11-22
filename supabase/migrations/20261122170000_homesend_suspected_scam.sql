-- A suspected scam (owner, 2026-11-22, "Flag as scam"): a message asking for a
-- PIN or OTP, or demanding payment through a link under a threat, is never
-- recorded as a bill. HomeSend keeps it as "unknown" and sets it aside at once
-- with this reason; its sender is warned not to pay or share a PIN.
--
-- Safe in either order: before this runs, the set-aside with the new reason is
-- refused by the old check, so the item stays classified as "unknown" (which
-- nothing ever adds) and the daily tidy sets it aside later; the archive list
-- words an unknown reason generically.

alter table public.home_send_items drop constraint if exists home_send_items_archive_reason_check;
alter table public.home_send_items add constraint home_send_items_archive_reason_check
  check (archive_reason is null or archive_reason in (
    'untouched_30_days', 'past_date', 'already_recorded', 'superseded', 'cancelled', 'unreadable', 'removed_by_person',
    'not_household', 'kept_as_note', 'not_resent', 'health_not_claimed', 'suspected_scam',
    'new_sender', 'sender_blocked', 'sender_not_answered'
  ));

-- Data retention phase 2a: passed calendar events (the owner, 2026-10-28, Q1;
-- design in docs/data-retention.md).
--
-- Adds the reversible `soft_deleted_at` marker to family_events, so passed
-- one-off events can be cleaned on the household's retention window (kept
-- whatever the window: protected events, birthdays, and appointments). This
-- migration is additive, but UNLIKE phase 1 the shipped code READS this
-- column (the calendar and event readers filter `soft_deleted_at is null`), so
-- it must be applied to live BEFORE the code deploys — see
-- docs/data-retention.md §10 "Migration ordering".
--
-- No hard delete happens from this migration or the code it ships: the purge
-- runs in dry-run (report-only) mode until the owner reviews a report (Q4).

alter table public.family_events add column if not exists soft_deleted_at timestamptz;

comment on column public.family_events.soft_deleted_at is
  'When retention cleanup hid this passed event; null means live. Reversible (set back to null) until purged. See docs/data-retention.md.';

-- The cleanup scans live, passed events per household; the (gated) purge scans
-- hidden events past their grace window. One partial index for each shape.
create index if not exists family_events_cleanup_idx
  on public.family_events (household_id, ends_at)
  where soft_deleted_at is null;
create index if not exists family_events_purge_idx
  on public.family_events (soft_deleted_at)
  where soft_deleted_at is not null;

notify pgrst, 'reload schema';

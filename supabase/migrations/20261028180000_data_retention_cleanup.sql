-- Data retention: periodic cleanup of passed household ephemera (the owner,
-- 2026-10-28; design in `docs/data-retention.md`).
--
-- Entries that existed only so the household would not forget a dated, upcoming
-- thing stop being load-bearing once that thing has passed and been handled.
-- Keeping them only stores personal information about people with nobody
-- needing it. This migration lays the retention FRAMEWORK:
--
--   * a reversible `soft_deleted_at` marker on the first two safe categories,
--   * the partial indexes the cleanup and (gated) purge filter on,
--   * `retention_cleanup_runs`, a counts-only audit trail.
--
-- Everything here is additive and safe in either order relative to the code:
-- `soft_deleted_at` defaults null, every existing reader ignores it, and only
-- the new server-side cleanup engine references it. No hard delete happens
-- here or from any code this migration ships — the purge step is gated off
-- (`RETENTION_PURGE_ENABLED`, default false) and does not run against live data
-- until the owner confirms the policy (guardrail G7).

-- 1. The reversible soft-delete marker on the phase-1 categories --------------
-- `availability_exceptions`: a helper's day off, no inbound foreign keys.
-- `family_event_changes`: a server-only change log, nothing references it.
alter table public.availability_exceptions add column if not exists soft_deleted_at timestamptz;
alter table public.family_event_changes add column if not exists soft_deleted_at timestamptz;

comment on column public.availability_exceptions.soft_deleted_at is
  'When retention cleanup marked this passed row for removal; null means live. Reversible (set back to null) until purged. See docs/data-retention.md.';
comment on column public.family_event_changes.soft_deleted_at is
  'When retention cleanup marked this old change-log row for removal; null means live. Reversible until purged. See docs/data-retention.md.';

-- The cleanup scans live rows past their window; the (gated) purge scans
-- soft-deleted rows past their grace window. One partial index for each shape,
-- per table, so neither scan ever walks the whole table.
create index if not exists availability_exceptions_cleanup_idx
  on public.availability_exceptions (household_id, on_date)
  where soft_deleted_at is null;
create index if not exists availability_exceptions_purge_idx
  on public.availability_exceptions (soft_deleted_at)
  where soft_deleted_at is not null;

create index if not exists family_event_changes_cleanup_idx
  on public.family_event_changes (household_id, created_at)
  where soft_deleted_at is null;
create index if not exists family_event_changes_purge_idx
  on public.family_event_changes (soft_deleted_at)
  where soft_deleted_at is not null;

-- 2. The audit trail: that cleanup ran, in counts, never in content -----------
-- One row per (household, category, phase) each time the job touches something.
-- It records how many rows and over what window — deliberately never which
-- rows or what they said, so the record of removing personal information does
-- not itself re-store it (guardrail G6).
create table public.retention_cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  -- Which cleanup spec ran, e.g. 'availability_exceptions', 'family_event_changes'.
  category text not null check (char_length(category) between 1 and 80),
  -- Where in the lifecycle this run sat.
  phase text not null check (phase in ('soft_delete', 'restore', 'purge')),
  -- How many rows this run moved. A count only — never an id, title or body.
  affected integer not null default 0 check (affected >= 0),
  -- The retention window in force when the run happened; null means "off".
  window_days integer check (window_days is null or window_days between 1 and 3650),
  ran_at timestamptz not null default now()
);

comment on table public.retention_cleanup_runs is
  'A counts-only record that retention cleanup ran (the owner, 2026-10-28). Never holds the content it removed. Admins read it; only the server writes it. See docs/data-retention.md.';

alter table public.retention_cleanup_runs enable row level security;

-- Admins of the household read their own household's cleanup history; nobody
-- else, and no session writes it (the sweep writes on the admin client, like
-- audit_events). Set-based membership, never a per-row helper.
create policy retention_cleanup_runs_select_admin
  on public.retention_cleanup_runs for select
  to authenticated
  using (household_id in (select wh.admin_households()));

create index retention_cleanup_runs_household_ran_idx
  on public.retention_cleanup_runs (household_id, ran_at desc);

notify pgrst, 'reload schema';

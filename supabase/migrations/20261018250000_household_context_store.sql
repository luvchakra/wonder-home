-- HomeBrain 3.0, phase A (design/HOMEBRAIN-3.0-HOUSEHOLD-CONTEXT.md §3.1, §4):
-- the Household Context Store.
--
-- One row per household holding the household's whole context — every
-- active record as the canonical `HouseholdContextItem[]` the context engine
-- already builds, with no horizon and no per-list cap — so a HomeTalk turn
-- reads one row instead of rebuilding the picture from twenty domain reads.
--
-- The row is derived and rebuildable: the domain tables stay the only source
-- of truth. A domain write sets `stale_since`; the row is current only while
-- `stale_since` is null or earlier than `built_at` (the moment the last
-- rebuild began reading), so a write that lands while a rebuild is reading
-- still leaves the row stale. The rebuild runs right after the response that
-- wrote, and a turn that still finds the row stale rebuilds it inline once.
--
-- Service role only. It holds the whole household before the viewer filter
-- runs, so no session may read it: the server reads it after
-- `requireMembership`, runs `filterForViewer` in memory, and only then does
-- anything leave. The browser never sees it. The repo's server-only shape
-- (`payment_provider_plans`, `billing_reconciliation_findings`): the usual
-- grants and a policy that lets no session through, so a session sees no
-- rows rather than a permission error, and the tenant-isolation suite can
-- read it as any other household table.

create table public.household_context (
  household_id uuid primary key references public.households(id) on delete cascade,
  version bigint not null default 1,
  document jsonb not null default '[]'::jsonb,
  -- { [domain]: { count, builtAt } } — which domains the document holds and when each was read.
  sections jsonb not null default '{}'::jsonb,
  -- Domain labels that could not be read in the last build, in the household's words.
  unavailable jsonb not null default '[]'::jsonb,
  size_bytes integer not null default 0 check (size_bytes between 0 and 2097152),
  -- When a domain write last changed the household; null since the last rebuild.
  stale_since timestamptz,
  built_at timestamptz not null default now()
);

comment on table public.household_context is
  'HomeBrain 3.0: the household''s whole context as canonical items, derived from the domain tables and rebuilt on change. Server-only; the viewer filter runs in memory before anything leaves.';

alter table public.household_context enable row level security;
grant select, insert, update, delete on public.household_context to anon, authenticated;

create policy household_context_no_client_access
  on public.household_context for all
  to anon, authenticated
  using (false)
  with check (false);

notify pgrst, 'reload schema';

-- Outcomes and routines (stories 03-001 through 03-005).
--
-- Applied to the wonder-home Supabase project as version 20260917020352.
--
-- An outcome is a desired household result with an owner, a window and a way of
-- being verified — "everyone has clean clothes ready for the week" — not a task.
-- The distinction is the product: nobody ticks these off to keep the system
-- accurate, which is why verification has a source and why the evaluation runs
-- on its own rather than waiting for someone to report.
--
-- A routine instantiates outcomes; it is not itself the thing tracked. Keeping
-- them separate means a routine's definition can change without rewriting the
-- history of what actually happened.

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  playbook_item_id uuid not null references public.playbook_items(id) on delete cascade,
  schedule jsonb not null default '{}'::jsonb,
  next_due_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (playbook_item_id)
);

comment on table public.routines is
  'A recurring outcome definition. Instantiates outcomes; it is not itself the thing that is tracked.';

alter table public.routines enable row level security;

create index routines_due_idx on public.routines (next_due_at) where active;

create trigger routines_set_updated_at
  before update on public.routines
  for each row execute function wh.set_updated_at();

create table public.outcomes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  playbook_item_id uuid references public.playbook_items(id) on delete set null,
  routine_id uuid references public.routines(id) on delete set null,
  outcome_key text not null check (outcome_key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  status text not null default 'pending'
    check (status in ('pending', 'on_track', 'at_risk', 'blocked', 'met', 'missed', 'cancelled')),
  risk_level text not null default 'none' check (risk_level in ('none', 'low', 'medium', 'high')),
  owner_member_id uuid references public.household_members(id) on delete set null,
  window_start timestamptz,
  due_at timestamptz,
  verified_at timestamptz,
  -- How we know, not just that we know. An inferred result and a member's own
  -- confirmation are different kinds of evidence and should not look alike.
  verification_source text check (verification_source in
    ('observed', 'integration', 'member_confirmed', 'inferred')),
  state jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outcomes_window_ordered check (window_start is null or due_at is null or window_start <= due_at),
  -- Verified without a source, or a source without a time, is a half-truth.
  constraint outcomes_verified_has_source check (
    (verified_at is null) = (verification_source is null)
  )
);

comment on table public.outcomes is
  'A desired household result with an owner, a window and a verification method. Not a task: nobody ticks these off to keep them accurate.';

alter table public.outcomes enable row level security;

create index outcomes_household_status_idx on public.outcomes (household_id, status);
create index outcomes_due_idx on public.outcomes (due_at) where status in ('pending', 'on_track', 'at_risk');
create index outcomes_owner_idx on public.outcomes (owner_member_id);

-- A routine produces one live outcome per due date. Without this a retrying
-- scheduler quietly creates duplicates and the household is told twice.
create unique index outcomes_one_open_per_routine_window
  on public.outcomes (routine_id, due_at)
  where routine_id is not null and status in ('pending', 'on_track', 'at_risk', 'blocked');

create trigger outcomes_set_updated_at
  before update on public.outcomes
  for each row execute function wh.set_updated_at();

create table public.outcome_exceptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  outcome_id uuid not null references public.outcomes(id) on delete cascade,
  kind text not null check (kind in ('late', 'at_risk', 'blocked', 'dependency_failed', 'no_owner')),
  -- Both are NOT NULL on purpose: an exception with no impact and no
  -- recommendation is an observation, and the notification engine has nothing
  -- to offer a person about it.
  impact text not null check (length(trim(impact)) between 1 and 300),
  recommended_action jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.outcome_exceptions is
  'Something that needs attention, with its impact and a recommended action. An exception with neither is not an exception.';

alter table public.outcome_exceptions enable row level security;

create index outcome_exceptions_open_idx on public.outcome_exceptions (household_id, detected_at desc)
  where resolved_at is null;

-- One open exception of a kind per outcome: re-detecting the same problem
-- evolves the existing record rather than stacking up duplicates.
create unique index outcome_exceptions_one_open_per_kind
  on public.outcome_exceptions (outcome_id, kind) where resolved_at is null;

create or replace function wh.assert_outcome_owner_in_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  if new.owner_member_id is null then
    return new;
  end if;

  select household_id into v_household from public.household_members where id = new.owner_member_id;
  if v_household is distinct from new.household_id then
    raise exception 'Owner % is not part of household %', new.owner_member_id, new.household_id
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger outcomes_owner_valid
  before insert or update on public.outcomes
  for each row execute function wh.assert_outcome_owner_in_household();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Outcomes and exceptions are written by the engine through the service role,
-- not by members: an outcome that a person can edit into "done" is a checklist,
-- which is the thing this product exists not to be. An owner may update their
-- own outcome (to confirm it, or add state), and administrators may correct.
-- ---------------------------------------------------------------------------

create policy routines_select_member on public.routines for select
  to authenticated using (wh.is_member(household_id));
create policy routines_write_admin on public.routines for all
  to authenticated using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

create policy outcomes_select_member on public.outcomes for select
  to authenticated using (wh.is_member(household_id));
create policy outcomes_update_owner_or_admin on public.outcomes for update
  to authenticated
  using (wh.is_household_admin(household_id) or owner_member_id = wh.member_id(household_id))
  with check (wh.is_household_admin(household_id) or owner_member_id = wh.member_id(household_id));

create policy outcome_exceptions_select_member on public.outcome_exceptions for select
  to authenticated using (wh.is_member(household_id));

notify pgrst, 'reload schema';

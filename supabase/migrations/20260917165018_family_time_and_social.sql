-- Family time and social (stories 12-001 through 12-008).
--
-- Applied to the wonder-home Supabase project as version 20260917165018.
--
-- This module finally gives the household a calendar, which several earlier
-- modules have been politely assuming: module 08 estimates a child's free time,
-- module 10 asks whether a cook is available, module 13 asks whether anyone is
-- home. Those were all written to overstate availability rather than invent it,
-- and this is where the real answer comes from.
--
-- The rule that shapes the schema: a confirmed family commitment is a
-- first-class scheduling constraint, not a preference an optimiser may spend.
-- `protected` is a column rather than a convention precisely so that automation
-- cannot quietly consume Sunday afternoon to make a routine fit.

create table public.family_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  kind text not null default 'family_time' check (kind in
    ('family_time', 'outing', 'birthday', 'gathering', 'appointment', 'school_event', 'travel')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text check (length(trim(location)) <= 200),
  -- Whether automation may schedule over this. Confirmed family time may not
  -- be consumed silently — the criterion is explicit, and this is the column
  -- that makes it enforceable rather than remembered.
  protected boolean not null default false,
  -- Somebody owns every social commitment. An event with no owner becomes
  -- passive calendar data, which is what these stories exist to prevent.
  owner_member_id uuid references public.household_members(id) on delete set null,
  status text not null default 'planned' check (status in
    ('proposed', 'planned', 'confirmed', 'happened', 'cancelled')),
  -- What still has to happen about it, if anything.
  action_state text check (action_state in
    ('needs_rsvp', 'needs_gift', 'needs_preparation', 'needs_travel', 'ready')),
  action_due_at timestamptz,
  notes text check (length(trim(notes)) <= 1000),
  integration_id uuid references public.integrations(id) on delete set null,
  external_id text check (length(trim(external_id)) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_events_ordered check (starts_at < ends_at),
  -- Protected time has to be somebody's, so there is a person to ask before it
  -- moves.
  constraint family_events_protected_has_owner check (not protected or owner_member_id is not null),
  unique (integration_id, external_id)
);

comment on table public.family_events is
  'Shared family and social commitments. Protected time is a scheduling constraint automation may not spend.';

alter table public.family_events enable row level security;

create index family_events_window_idx on public.family_events (household_id, starts_at)
  where status in ('proposed', 'planned', 'confirmed');
create index family_events_action_idx on public.family_events (household_id, action_due_at)
  where action_state is not null and action_state <> 'ready';

create trigger family_events_set_updated_at
  before update on public.family_events
  for each row execute function wh.set_updated_at();

create table public.event_participants (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  event_id uuid not null references public.family_events(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  -- Whether this person's attendance is settled, which is what an RSVP is.
  response text not null default 'unknown'
    check (response in ('unknown', 'yes', 'no', 'maybe')),
  -- Whether their being there is what makes the event an event.
  required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, member_id)
);

comment on table public.event_participants is
  'Who an event involves and whether they have answered. An event stays linked to the people it constrains.';

alter table public.event_participants enable row level security;

create index event_participants_member_idx on public.event_participants (member_id);

create trigger event_participants_set_updated_at
  before update on public.event_participants
  for each row execute function wh.set_updated_at();

create table public.schedule_conflicts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  -- The two things that cannot both happen. Both are named, because a conflict
  -- that says only "something clashes" cannot be resolved by anybody.
  left_kind text not null check (left_kind in ('event', 'meal', 'school_item', 'routine', 'service_request')),
  left_id uuid not null,
  left_label text not null check (length(trim(left_label)) between 1 and 200),
  right_kind text not null check (right_kind in ('event', 'meal', 'school_item', 'routine', 'service_request')),
  right_id uuid not null,
  right_label text not null check (length(trim(right_label)) between 1 and 200),
  overlap_starts_at timestamptz not null,
  overlap_ends_at timestamptz not null,
  -- The proposal. A conflict is never resolved by silently moving a confirmed
  -- commitment, so what is stored is a suggestion somebody accepts or declines.
  proposed_action text not null check (proposed_action in
    ('move_left', 'move_right', 'shorten_left', 'shorten_right', 'drop_optional', 'ask_household')),
  proposed_detail text check (length(trim(proposed_detail)) <= 300),
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'resolved', 'stale')),
  resolved_by_member_id uuid references public.household_members(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint schedule_conflicts_ordered check (overlap_starts_at < overlap_ends_at),
  constraint schedule_conflicts_resolution_has_person check (
    (resolved_at is null) = (resolved_by_member_id is null)
  ),
  -- The same clash detected twice is one conflict, not two notifications.
  unique (household_id, left_id, right_id, overlap_starts_at)
);

comment on table public.schedule_conflicts is
  'Two things that cannot both happen, and a proposed way out. Never a silent move of a confirmed commitment.';

alter table public.schedule_conflicts enable row level security;

create index schedule_conflicts_open_idx on public.schedule_conflicts (household_id, overlap_starts_at)
  where status = 'open';

create table public.gift_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  event_id uuid references public.family_events(id) on delete cascade,
  -- Who it is for. A name rather than a member, because most gifts are for
  -- people outside the household.
  recipient text not null check (length(trim(recipient)) between 1 and 120),
  occasion text check (length(trim(occasion)) <= 120),
  needed_by date not null,
  budget_minor bigint check (budget_minor >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  idea text check (length(trim(idea)) <= 300),
  status text not null default 'needed'
    check (status in ('needed', 'chosen', 'ordered', 'wrapped', 'given', 'cancelled')),
  responsible_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gift_plans_budget_has_currency check ((budget_minor is null) = (currency is null))
);

comment on table public.gift_plans is
  'A gift that has to exist by a date. Planned against an explicit occasion rather than guessed at.';

alter table public.gift_plans enable row level security;

create index gift_plans_open_idx on public.gift_plans (household_id, needed_by)
  where status in ('needed', 'chosen', 'ordered');

create trigger gift_plans_set_updated_at
  before update on public.gift_plans
  for each row execute function wh.set_updated_at();

-- ---------------------------------------------------------------------------
-- Cross-table invariants
-- ---------------------------------------------------------------------------

create trigger event_participants_event_valid
  before insert or update on public.event_participants
  for each row execute function wh.assert_commerce_row_in_household('event_id', 'family_events');

create trigger event_participants_member_valid
  before insert or update on public.event_participants
  for each row execute function wh.assert_meal_member_in_household('member_id');

create trigger family_events_owner_valid
  before insert or update on public.family_events
  for each row execute function wh.assert_meal_member_in_household('owner_member_id');

create trigger gift_plans_event_valid
  before insert or update on public.gift_plans
  for each row execute function wh.assert_commerce_row_in_household('event_id', 'family_events');

create trigger gift_plans_responsible_valid
  before insert or update on public.gift_plans
  for each row execute function wh.assert_meal_member_in_household('responsible_member_id');

create trigger schedule_conflicts_resolver_valid
  before insert or update on public.schedule_conflicts
  for each row execute function wh.assert_meal_member_in_household('resolved_by_member_id');

-- ---------------------------------------------------------------------------
-- Free/busy without the details
--
-- The planner needs to know when people are free. It does not need to know what
-- they are doing, and the criterion says common availability must expose "only
-- the minimum free/busy information needed for planning, not private calendar
-- details". This function returns windows and nothing else — no titles, no
-- locations, no notes — so a planner cannot read a private appointment even by
-- accident.
-- ---------------------------------------------------------------------------

create or replace function wh.busy_windows(
  p_household_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (member_id uuid, busy_from timestamptz, busy_to timestamptz, protected boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.member_id, e.starts_at, e.ends_at, e.protected
  from public.family_events e
  join public.event_participants p on p.event_id = e.id
  where e.household_id = p_household_id
    and wh.is_member(p_household_id)
    and e.status in ('planned', 'confirmed')
    and e.ends_at > p_from
    and e.starts_at < p_to
    and p.response <> 'no';
$$;

comment on function wh.busy_windows is
  'When each member is unavailable, and nothing about why. Free/busy only, by design.';

grant execute on function wh.busy_windows(uuid, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Family time is shared: everyone in the household sees the events and who is
-- coming. Anyone may propose one; changing somebody else's commitment is
-- narrower, because an event is a promise between people rather than a row.
-- ---------------------------------------------------------------------------

create policy family_events_select_member on public.family_events for select
  to authenticated using (wh.is_member(household_id));

create policy family_events_insert_member on public.family_events for insert
  to authenticated with check (wh.is_member(household_id));

create policy family_events_update_owner on public.family_events for update
  to authenticated
  using (
    wh.is_member(household_id)
    and (owner_member_id is null or owner_member_id = wh.member_id(household_id) or wh.is_household_admin(household_id))
  )
  with check (
    wh.is_member(household_id)
    and (owner_member_id is null or owner_member_id = wh.member_id(household_id) or wh.is_household_admin(household_id))
  );

create policy family_events_delete_owner on public.family_events for delete
  to authenticated
  using (
    wh.is_member(household_id)
    and (owner_member_id = wh.member_id(household_id) or wh.is_household_admin(household_id))
  );

create policy event_participants_select_member on public.event_participants for select
  to authenticated using (wh.is_member(household_id));

-- A person answers for themselves. An administrator may answer for a child who
-- has no account, which is the only reason anybody answers for anybody else.
create policy event_participants_write_own on public.event_participants for all
  to authenticated
  using (
    wh.is_member(household_id)
    and (member_id = wh.member_id(household_id) or wh.is_household_admin(household_id))
  )
  with check (
    wh.is_member(household_id)
    and (member_id = wh.member_id(household_id) or wh.is_household_admin(household_id))
  );

-- Conflicts are detected and written by the server. There is deliberately no
-- member INSERT policy: somebody who could manufacture a conflict could make
-- WonderHome propose moving another person's commitment.
create policy schedule_conflicts_select_member on public.schedule_conflicts for select
  to authenticated using (wh.is_member(household_id));

create policy schedule_conflicts_resolve_member on public.schedule_conflicts for update
  to authenticated
  using (wh.is_member(household_id))
  with check (wh.is_member(household_id));

create policy gift_plans_select_member on public.gift_plans for select
  to authenticated using (wh.is_member(household_id));

create policy gift_plans_write_member on public.gift_plans for all
  to authenticated
  using (wh.is_member(household_id))
  with check (wh.is_member(household_id));

notify pgrst, 'reload schema';

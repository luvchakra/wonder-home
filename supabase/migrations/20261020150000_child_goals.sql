-- Kids & School: a child's goals, and the days they were kept (story 08-017).
--
-- A guardian or an Admin sets a small goal with a child ("Read for 20
-- minutes", every day, 2 stars a time, reward "Pick Friday's movie"); the
-- child, or a guardian, ticks off the day it was done. Stars are never
-- stored: they are counted from these check-ins and from school work the
-- child marked done, so every number on the child's screen is arithmetic
-- somebody can explain (rule 9). A goal is retired, never deleted, so its
-- check-ins keep their history (rule 12). A check-in is a fact about one
-- day; taking it back removes just that row.

create table public.child_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  child_member_id uuid not null references public.household_members(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 120),
  -- Picked from a list with its own way to add one (rule 20): reading, practice…
  kind text not null default 'other' check (length(trim(kind)) between 1 and 40),
  -- One picture for the goal's tile, from a fixed set the form offers.
  emoji text not null default '⭐' check (length(emoji) between 1 and 16),
  -- How often it counts: every day, a number of days a week, or once.
  period text not null default 'day' check (period in ('day', 'week', 'once')),
  -- Days a week it needs, for a weekly goal; 1 for the others.
  target smallint not null default 1 check (target between 1 and 7),
  stars smallint not null default 1 check (stars between 1 and 5),
  reward text check (reward is null or length(trim(reward)) <= 120),
  ends_on date,
  created_by uuid references public.household_members(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint child_goals_target_fits check (period = 'week' or target = 1)
);

comment on table public.child_goals is
  'A small goal a guardian set with a child (story 08-017). Read by the child, guardians and Admins; written by guardians and Admins; retired, never deleted.';

create index child_goals_child_idx on public.child_goals (household_id, child_member_id) where active;
create index child_goals_created_by_idx on public.child_goals (created_by);

create trigger child_goals_set_updated_at
  before update on public.child_goals
  for each row execute function wh.set_updated_at();

alter table public.child_goals enable row level security;

create policy child_goals_select on public.child_goals for select
  to authenticated
  using (household_id in (select wh.member_households()) and wh.may_see_child(household_id, child_member_id));

create policy child_goals_insert on public.child_goals for insert
  to authenticated
  with check (wh.may_change_child(household_id, child_member_id) and wh.is_child_of(household_id, child_member_id));

create policy child_goals_update on public.child_goals for update
  to authenticated
  using (wh.may_change_child(household_id, child_member_id))
  with check (wh.may_change_child(household_id, child_member_id) and wh.is_child_of(household_id, child_member_id));

grant select, insert, update on public.child_goals to authenticated;

create table public.child_goal_checkins (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  goal_id uuid not null references public.child_goals(id) on delete cascade,
  -- The goal's child, kept on the row so its policy needs no join.
  child_member_id uuid not null references public.household_members(id) on delete cascade,
  -- The day on the household's clock it was done.
  on_day date not null,
  checked_by uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (goal_id, on_day)
);

comment on table public.child_goal_checkins is
  'A day a child kept a goal (story 08-017). The child or a guardian adds or takes back one; stars are counted from these rows, never stored.';

create index child_goal_checkins_child_idx on public.child_goal_checkins (household_id, child_member_id, on_day desc);
create index child_goal_checkins_checked_by_idx on public.child_goal_checkins (checked_by);

alter table public.child_goal_checkins enable row level security;

create policy child_goal_checkins_select on public.child_goal_checkins for select
  to authenticated
  using (household_id in (select wh.member_households()) and wh.may_see_child(household_id, child_member_id));

-- The child themselves or a guardian, for a current goal of that child, no
-- later than tomorrow on any clock (a day is never claimed ahead).
create policy child_goal_checkins_insert on public.child_goal_checkins for insert
  to authenticated
  with check (
    household_id in (select wh.member_households())
    and wh.may_see_child(household_id, child_member_id)
    and on_day <= (now() at time zone 'utc')::date + 1
    and exists (
      select 1 from public.child_goals g
      where g.id = goal_id and g.household_id = child_goal_checkins.household_id
        and g.child_member_id = child_goal_checkins.child_member_id and g.active
    )
  );

create policy child_goal_checkins_delete on public.child_goal_checkins for delete
  to authenticated
  using (household_id in (select wh.member_households()) and wh.may_see_child(household_id, child_member_id));

grant select, insert, delete on public.child_goal_checkins to authenticated;

-- HomeBrain's stored context hears about these writes like any domain table's.
create or replace trigger child_goals_marks_context_stale
  after insert or update or delete on public.child_goals
  for each row execute function wh.mark_context_stale();
create or replace trigger child_goal_checkins_marks_context_stale
  after insert or update or delete on public.child_goal_checkins
  for each row execute function wh.mark_context_stale();

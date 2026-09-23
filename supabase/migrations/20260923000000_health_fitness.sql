-- Health & Fitness: fitness goals & sessions (story 21-008).
--
-- Lightweight, consistency-oriented fitness tracking -- never a leaderboard,
-- never guilt messaging, never child fitness surveillance. A goal is a
-- household member's own stated intention ("walk three times a week":
-- activity, how many times, how often, an optional preferred time). A
-- session is a single logged activity (what, how long, how far, when) that
-- may optionally count toward a goal, exactly the way health_vitals.routine_id
-- traces a reading back to the routine that produced it.
--
-- `provider_id` is this story's other half: the provider-neutral abstraction
-- (`packages/core/src/health/health-provider.ts`) a goal or session's data
-- claims to have come from. The check constraint below names the full future
-- domain -- manual/home_talk/home_send/calendar, already real today, plus
-- apple_health_kit/android_health_connect/wearable, declared but not live --
-- so a later connector needs no schema change, only its own live: true. The
-- application layer (health-provider.ts's assertHealthProviderLive) is what
-- actually refuses a write claiming one of the three inert providers; the
-- schema only has to describe the whole domain honestly, the same discipline
-- health_vitals.source_type already established with its own
-- 'future_health_integration' placeholder.
--
-- Same RLS shape as every other health entity: select via
-- `wh.may_see_health()`, three separate self-or-guardian-only write
-- policies, no household-admin bypass. `health_fitness_goals` is created
-- first since `health_fitness_sessions.goal_id` references it.

create table public.health_fitness_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  activity_type text not null check (activity_type in (
    'walk', 'run', 'cycle', 'swim', 'yoga', 'strength_training', 'sports', 'stretching', 'other'
  )),
  custom_label text check (length(trim(custom_label)) <= 80),
  target_count integer not null check (target_count > 0),
  frequency_period text not null check (frequency_period in ('day', 'week', 'month')),
  preferred_time time,
  privacy_scope text not null default 'private'
    check (privacy_scope in ('private', 'selected_family', 'household_operational')),
  status text not null default 'active' check (status in ('active', 'dismissed')),
  provider_id text not null default 'manual' check (provider_id in (
    'manual', 'home_talk', 'home_send', 'calendar',
    'apple_health_kit', 'android_health_connect', 'wearable'
  )),
  provenance_id uuid references public.health_provenance(id) on delete set null,
  notes text check (length(trim(notes)) <= 1000),
  created_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_fitness_goals_custom_label_required check (
    (activity_type = 'other' and custom_label is not null) or (activity_type <> 'other')
  )
);

comment on table public.health_fitness_goals is
  'A household member''s own consistency-oriented fitness intention -- never a leaderboard entry, never scored. privacy_scope gates visibility the same way health_profiles does -- see wh.may_see_health().';

alter table public.health_fitness_goals enable row level security;

create index health_fitness_goals_household_idx on public.health_fitness_goals (household_id);
create index health_fitness_goals_member_status_idx on public.health_fitness_goals (member_id, status);

create trigger health_fitness_goals_set_updated_at
  before update on public.health_fitness_goals
  for each row execute function wh.set_updated_at();

create trigger health_fitness_goals_member_valid
  before insert or update on public.health_fitness_goals
  for each row execute function wh.assert_meal_member_in_household('member_id');

create policy health_fitness_goals_select_visible on public.health_fitness_goals for select
  to authenticated using (wh.may_see_health(household_id, member_id, privacy_scope));

create policy health_fitness_goals_insert_self_or_guardian on public.health_fitness_goals for insert
  to authenticated
  with check (
    wh.is_member(household_id)
    and (
      wh.member_id(household_id) = member_id
      or exists (
        select 1 from public.member_guardians g
        where g.child_member_id = member_id and g.guardian_member_id = wh.member_id(household_id)
      )
    )
  );

create policy health_fitness_goals_update_self_or_guardian on public.health_fitness_goals for update
  to authenticated
  using (
    wh.is_member(household_id)
    and (
      wh.member_id(household_id) = member_id
      or exists (
        select 1 from public.member_guardians g
        where g.child_member_id = member_id and g.guardian_member_id = wh.member_id(household_id)
      )
    )
  )
  with check (
    wh.is_member(household_id)
    and (
      wh.member_id(household_id) = member_id
      or exists (
        select 1 from public.member_guardians g
        where g.child_member_id = member_id and g.guardian_member_id = wh.member_id(household_id)
      )
    )
  );

create policy health_fitness_goals_delete_self_or_guardian on public.health_fitness_goals for delete
  to authenticated
  using (
    wh.is_member(household_id)
    and (
      wh.member_id(household_id) = member_id
      or exists (
        select 1 from public.member_guardians g
        where g.child_member_id = member_id and g.guardian_member_id = wh.member_id(household_id)
      )
    )
  );

create table public.health_fitness_sessions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  goal_id uuid references public.health_fitness_goals(id) on delete set null,
  activity_type text not null check (activity_type in (
    'walk', 'run', 'cycle', 'swim', 'yoga', 'strength_training', 'sports', 'stretching', 'other'
  )),
  custom_label text check (length(trim(custom_label)) <= 80),
  duration_minutes integer not null check (duration_minutes > 0),
  distance_value numeric,
  distance_unit text check (length(trim(distance_unit)) between 1 and 20),
  started_at timestamptz not null default now(),
  privacy_scope text not null default 'private'
    check (privacy_scope in ('private', 'selected_family', 'household_operational')),
  status text not null default 'active' check (status in ('active', 'archived')),
  provider_id text not null default 'manual' check (provider_id in (
    'manual', 'home_talk', 'home_send', 'calendar',
    'apple_health_kit', 'android_health_connect', 'wearable'
  )),
  provenance_id uuid references public.health_provenance(id) on delete set null,
  notes text check (length(trim(notes)) <= 1000),
  created_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_fitness_sessions_custom_label_required check (
    (activity_type = 'other' and custom_label is not null) or (activity_type <> 'other')
  ),
  constraint health_fitness_sessions_distance_paired check (
    (distance_value is null) = (distance_unit is null)
  )
);

comment on table public.health_fitness_sessions is
  'A single logged activity -- always what the household actually recorded, never a value WonderHome infers. May optionally trace back to the goal it counts toward via goal_id. privacy_scope gates visibility the same way health_profiles does -- see wh.may_see_health().';

alter table public.health_fitness_sessions enable row level security;

create index health_fitness_sessions_household_idx on public.health_fitness_sessions (household_id);
create index health_fitness_sessions_member_started_idx on public.health_fitness_sessions (member_id, started_at desc);
create index health_fitness_sessions_goal_idx on public.health_fitness_sessions (goal_id) where goal_id is not null;

create trigger health_fitness_sessions_set_updated_at
  before update on public.health_fitness_sessions
  for each row execute function wh.set_updated_at();

create trigger health_fitness_sessions_member_valid
  before insert or update on public.health_fitness_sessions
  for each row execute function wh.assert_meal_member_in_household('member_id');

create policy health_fitness_sessions_select_visible on public.health_fitness_sessions for select
  to authenticated using (wh.may_see_health(household_id, member_id, privacy_scope));

create policy health_fitness_sessions_insert_self_or_guardian on public.health_fitness_sessions for insert
  to authenticated
  with check (
    wh.is_member(household_id)
    and (
      wh.member_id(household_id) = member_id
      or exists (
        select 1 from public.member_guardians g
        where g.child_member_id = member_id and g.guardian_member_id = wh.member_id(household_id)
      )
    )
  );

create policy health_fitness_sessions_update_self_or_guardian on public.health_fitness_sessions for update
  to authenticated
  using (
    wh.is_member(household_id)
    and (
      wh.member_id(household_id) = member_id
      or exists (
        select 1 from public.member_guardians g
        where g.child_member_id = member_id and g.guardian_member_id = wh.member_id(household_id)
      )
    )
  )
  with check (
    wh.is_member(household_id)
    and (
      wh.member_id(household_id) = member_id
      or exists (
        select 1 from public.member_guardians g
        where g.child_member_id = member_id and g.guardian_member_id = wh.member_id(household_id)
      )
    )
  );

create policy health_fitness_sessions_delete_self_or_guardian on public.health_fitness_sessions for delete
  to authenticated
  using (
    wh.is_member(household_id)
    and (
      wh.member_id(household_id) = member_id
      or exists (
        select 1 from public.member_guardians g
        where g.child_member_id = member_id and g.guardian_member_id = wh.member_id(household_id)
      )
    )
  );

notify pgrst, 'reload schema';

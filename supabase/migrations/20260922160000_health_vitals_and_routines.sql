-- Health & Fitness: vitals & measurement routines (story 21-007).
--
-- A vital is a single structured reading (weight, height, temperature,
-- blood pressure, pulse, steps, distance, exercise duration, resting heart
-- rate, or a household-named custom measurement) -- always what the
-- household actually recorded, never a value WonderHome infers or fills in.
-- `value`/`secondary_value` cover both a single number (weight: 72 kg) and
-- a paired one (blood pressure: 128/82, `value`=systolic, `secondary_value`
-- =diastolic) without a second table. `unit` is free text the household
-- chose (kg vs lb, cm vs in, steps vs count) -- never a default this schema
-- or the application layer invents.
--
-- A measurement routine is a household-configured recurring commitment
-- ("measure blood pressure every Sunday morning") -- the same
-- `cadence_days`/`next_due_on` shape `health_checkups` already uses, plus a
-- `preferred_time` and `reminder_enabled` so HomeBrain's reminder sweep
-- (`packages/core/src/health/routine-reminders.ts`) knows when to nudge and
-- whether to at all. Completing a routine both advances its schedule and
-- creates the real vital reading in one step -- `health_vitals.routine_id`
-- is how a reading traces back to the routine that produced it, same
-- provenance discipline as everything else in this module.
--
-- Same RLS shape as every other health entity: select via
-- `wh.may_see_health()`, three separate self-or-guardian-only write
-- policies, no household-admin bypass. `health_measurement_routines` is
-- created first since `health_vitals.routine_id` references it.

create table public.health_measurement_routines (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  vital_type text not null check (vital_type in (
    'weight', 'height', 'temperature', 'blood_pressure', 'pulse', 'steps',
    'distance', 'exercise_duration', 'resting_heart_rate', 'custom'
  )),
  custom_label text check (length(trim(custom_label)) <= 80),
  cadence_days integer not null check (cadence_days > 0),
  preferred_time time,
  reminder_enabled boolean not null default true,
  privacy_scope text not null default 'private'
    check (privacy_scope in ('private', 'selected_family', 'household_operational')),
  status text not null default 'active' check (status in ('active', 'dismissed')),
  next_due_on date not null,
  last_completed_on date,
  notes text check (length(trim(notes)) <= 1000),
  created_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_measurement_routines_custom_label_required check (
    (vital_type = 'custom' and custom_label is not null) or (vital_type <> 'custom')
  )
);

comment on table public.health_measurement_routines is
  'A household-configured recurring measurement commitment -- never a schedule WonderHome invents on its own. privacy_scope gates visibility the same way health_profiles does -- see wh.may_see_health().';

alter table public.health_measurement_routines enable row level security;

create index health_measurement_routines_household_idx on public.health_measurement_routines (household_id);
create index health_measurement_routines_member_status_idx on public.health_measurement_routines (member_id, status);
create index health_measurement_routines_due_idx on public.health_measurement_routines (household_id, next_due_on) where status = 'active';

create trigger health_measurement_routines_set_updated_at
  before update on public.health_measurement_routines
  for each row execute function wh.set_updated_at();

create trigger health_measurement_routines_member_valid
  before insert or update on public.health_measurement_routines
  for each row execute function wh.assert_meal_member_in_household('member_id');

create policy health_measurement_routines_select_visible on public.health_measurement_routines for select
  to authenticated using (wh.may_see_health(household_id, member_id, privacy_scope));

create policy health_measurement_routines_insert_self_or_guardian on public.health_measurement_routines for insert
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

create policy health_measurement_routines_update_self_or_guardian on public.health_measurement_routines for update
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

create policy health_measurement_routines_delete_self_or_guardian on public.health_measurement_routines for delete
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

create table public.health_vitals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  vital_type text not null check (vital_type in (
    'weight', 'height', 'temperature', 'blood_pressure', 'pulse', 'steps',
    'distance', 'exercise_duration', 'resting_heart_rate', 'custom'
  )),
  custom_label text check (length(trim(custom_label)) <= 80),
  value numeric not null,
  secondary_value numeric,
  unit text not null check (length(trim(unit)) between 1 and 20),
  measured_at timestamptz not null default now(),
  privacy_scope text not null default 'private'
    check (privacy_scope in ('private', 'selected_family', 'household_operational')),
  status text not null default 'active' check (status in ('active', 'archived')),
  source_type text not null default 'manual_entry' check (source_type in
    ('home_talk', 'home_send_email', 'home_send_document', 'manual_entry', 'calendar', 'future_health_integration')),
  provenance_id uuid references public.health_provenance(id) on delete set null,
  routine_id uuid references public.health_measurement_routines(id) on delete set null,
  notes text check (length(trim(notes)) <= 1000),
  created_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_vitals_custom_label_required check (
    (vital_type = 'custom' and custom_label is not null) or (vital_type <> 'custom')
  )
);

comment on table public.health_vitals is
  'A single structured measurement reading -- always what the household actually recorded, never a value WonderHome infers. privacy_scope gates visibility the same way health_profiles does -- see wh.may_see_health().';

alter table public.health_vitals enable row level security;

create index health_vitals_household_idx on public.health_vitals (household_id);
create index health_vitals_member_type_idx on public.health_vitals (member_id, vital_type, measured_at desc);
create index health_vitals_routine_idx on public.health_vitals (routine_id) where routine_id is not null;

create trigger health_vitals_set_updated_at
  before update on public.health_vitals
  for each row execute function wh.set_updated_at();

create trigger health_vitals_member_valid
  before insert or update on public.health_vitals
  for each row execute function wh.assert_meal_member_in_household('member_id');

create policy health_vitals_select_visible on public.health_vitals for select
  to authenticated using (wh.may_see_health(household_id, member_id, privacy_scope));

create policy health_vitals_insert_self_or_guardian on public.health_vitals for insert
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

create policy health_vitals_update_self_or_guardian on public.health_vitals for update
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

create policy health_vitals_delete_self_or_guardian on public.health_vitals for delete
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

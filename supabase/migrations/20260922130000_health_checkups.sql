-- Health & Fitness: checkups & preventive care (story 21-004).
--
-- A checkup is a household-defined recurring commitment ("dental cleaning
-- every 6 months") -- never a schedule WonderHome invents on its own.
-- `source` records where it came from: `user_defined` (a household typed
-- it in), `doctor_recommended` (a provider's advice, entered by the
-- household), `imported_appointment` (derived from a real appointment the
-- household already booked), `configured_plan` (set via Manage Household's
-- playbook) or `informational_template` (an opt-in suggestion the
-- household chose to adopt -- never auto-adopted). Same RLS shape as
-- `health_appointments`/`health_issues`: select via `wh.may_see_health()`,
-- self-or-guardian-only writes, no household-admin bypass.
--
-- `linked_appointment_id` points at whichever real `health_appointments`
-- row currently represents "the next time this happens", set when a
-- household books an appointment against a checkup. Completing or
-- cancelling that appointment (`packages/core/src/health/checkups.ts`'s
-- `syncCheckupForAppointment`, called from both the server action and the
-- API route's `set_status` branch, the same two places a status change can
-- originate) advances the checkup accordingly: completing it records
-- `last_completed_on`, computes the next `next_due_on` from `cadence_days`
-- when one is configured, and clears `linked_appointment_id`; cancelling
-- only clears the link, freeing the checkup to be booked again. The
-- completed/cancelled appointment keeps its own history via
-- `health_appointments.checkup_id` pointing back either way.
--
-- `status` is `active`/`dismissed` rather than a hard delete -- CLAUDE.md
-- rule 12: removing a checkup a household no longer wants is never
-- one-way, and dismissing one never orphans the appointment history it
-- already produced.

create table public.health_checkups (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 160),
  checkup_type text not null default 'other' check (checkup_type in
    ('doctor', 'dentist', 'eye_care', 'physiotherapy', 'dermatology', 'specialist',
     'diagnostic', 'vaccination', 'screening', 'other')),
  source text not null default 'user_defined' check (source in
    ('user_defined', 'doctor_recommended', 'imported_appointment', 'configured_plan', 'informational_template')),
  cadence_days integer check (cadence_days is null or cadence_days > 0),
  next_due_on date not null,
  last_completed_on date,
  privacy_scope text not null default 'private'
    check (privacy_scope in ('private', 'selected_family', 'household_operational')),
  status text not null default 'active' check (status in ('active', 'dismissed')),
  linked_appointment_id uuid references public.health_appointments(id) on delete set null,
  notes text check (length(trim(notes)) <= 1000),
  created_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.health_checkups is
  'A recurring preventive-care commitment the household configured or imported -- never one WonderHome invented. privacy_scope gates visibility the same way health_profiles does -- see wh.may_see_health().';

alter table public.health_checkups enable row level security;

create index health_checkups_household_idx on public.health_checkups (household_id);
create index health_checkups_member_status_idx on public.health_checkups (member_id, status);
create index health_checkups_due_idx on public.health_checkups (household_id, next_due_on) where status = 'active';

create trigger health_checkups_set_updated_at
  before update on public.health_checkups
  for each row execute function wh.set_updated_at();

create trigger health_checkups_member_valid
  before insert or update on public.health_checkups
  for each row execute function wh.assert_meal_member_in_household('member_id');

create policy health_checkups_select_visible on public.health_checkups for select
  to authenticated using (wh.may_see_health(household_id, member_id, privacy_scope));

create policy health_checkups_insert_self_or_guardian on public.health_checkups for insert
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

create policy health_checkups_update_self_or_guardian on public.health_checkups for update
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

create policy health_checkups_delete_self_or_guardian on public.health_checkups for delete
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

-- The appointment side of the link: which checkup (if any) this
-- appointment represents the next occurrence of. Nullable -- most
-- appointments have no linked checkup.
alter table public.health_appointments add column checkup_id uuid references public.health_checkups(id) on delete set null;
create index health_appointments_checkup_idx on public.health_appointments (checkup_id) where checkup_id is not null;

notify pgrst, 'reload schema';

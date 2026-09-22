-- Health & Fitness: appointments (story 21-002).
--
-- Builds on 21-001's foundation: every appointment carries its own
-- `privacy_scope`, defaulting from the member's `health_profiles` row at the
-- application layer, and RLS is `wh.may_see_health` again -- the same
-- self/guardian/household_operational/consented-viewer rule, no admin
-- bypass. Write access (insert/update/delete) is narrower than read, exactly
-- as 21-001 already established for `health_profiles`: only the subject
-- themselves, or a guardian acting for the child they guard, may create or
-- change an appointment -- "for another person where permitted" (the
-- story's own acceptance criterion) means the guardian case, not any
-- consented viewer. A consent grant is about seeing, never about acting on
-- someone else's behalf.
--
-- Two deliberate privacy-driven scope decisions, recorded here because they
-- shape what this migration does and does not add:
--
-- 1. `schedule_conflicts` (module 12) is household-wide readable by design
--    (no per-row privacy scope) -- correct for the kinds it already carries
--    (event/meal/school_item/routine/service_request), none of which are
--    privacy-scoped. A health appointment must not leak into it unless the
--    appointment itself is already household-visible: this migration widens
--    `schedule_conflicts`' kind check constraints to accept
--    'health_appointment', and the application layer (`health/appointments.ts`)
--    only ever persists a conflict row for a `household_operational`-scope
--    appointment, using a label that names the person and says "appointment"
--    -- never the type, provider or notes. A `private`/`selected_family`
--    appointment's conflicts are detected the same way but returned only in
--    the API response to whoever can already see the appointment, never
--    written anywhere household-wide.
-- 2. `family_events` (module 12) likewise has no per-row privacy scope --
--    every row is visible to the whole household. "Calendar sync" on an
--    appointment therefore only ever creates a real `family_events` row for
--    a `household_operational`-scope appointment; a private or
--    selected_family appointment can ask for sync, but nothing is written
--    to the shared calendar until the household is who it is already
--    visible to.

alter table public.schedule_conflicts drop constraint schedule_conflicts_left_kind_check;
alter table public.schedule_conflicts add constraint schedule_conflicts_left_kind_check
  check (left_kind in ('event', 'meal', 'school_item', 'routine', 'service_request', 'health_appointment'));
alter table public.schedule_conflicts drop constraint schedule_conflicts_right_kind_check;
alter table public.schedule_conflicts add constraint schedule_conflicts_right_kind_check
  check (right_kind in ('event', 'meal', 'school_item', 'routine', 'service_request', 'health_appointment'));

create table public.health_appointments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  appointment_type text not null check (appointment_type in
    ('doctor', 'dentist', 'eye_care', 'physiotherapy', 'dermatology', 'specialist',
     'diagnostic', 'vaccination', 'mental_wellness', 'other')),
  status text not null default 'proposed'
    check (status in ('proposed', 'confirmed', 'completed', 'cancelled', 'rescheduled')),
  privacy_scope text not null default 'private'
    check (privacy_scope in ('private', 'selected_family', 'household_operational')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  provider text check (length(trim(provider)) <= 200),
  facility text check (length(trim(facility)) <= 200),
  location text check (length(trim(location)) <= 200),
  preparation_notes text check (length(trim(preparation_notes)) <= 1000),
  notes text check (length(trim(notes)) <= 1000),
  remind_advance boolean not null default true,
  remind_preparation boolean not null default false,
  remind_day_of boolean not null default true,
  calendar_sync boolean not null default false,
  family_event_id uuid references public.family_events(id) on delete set null,
  -- Rescheduling creates a new row rather than mutating the old time in
  -- place: the old row's own history (its original status, when it was
  -- confirmed, any reminders already sent against it) stays intact, and
  -- points forward to what replaced it.
  rescheduled_from_id uuid references public.health_appointments(id) on delete set null,
  created_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_appointments_ordered check (ends_at is null or starts_at < ends_at)
);

comment on table public.health_appointments is
  'A health appointment for one household member. privacy_scope gates visibility the same way health_profiles does -- see wh.may_see_health(). Completing or cancelling suppresses its remaining reminders by taking it out of the reminder sweep''s status filter.';

alter table public.health_appointments enable row level security;

create index health_appointments_household_idx on public.health_appointments (household_id);
create index health_appointments_member_window_idx on public.health_appointments (member_id, starts_at)
  where status in ('proposed', 'confirmed');
create index health_appointments_reminder_idx on public.health_appointments (household_id, starts_at)
  where status in ('proposed', 'confirmed');

create trigger health_appointments_set_updated_at
  before update on public.health_appointments
  for each row execute function wh.set_updated_at();

create trigger health_appointments_member_valid
  before insert or update on public.health_appointments
  for each row execute function wh.assert_meal_member_in_household('member_id');

create policy health_appointments_select_visible on public.health_appointments for select
  to authenticated using (wh.may_see_health(household_id, member_id, privacy_scope));

create policy health_appointments_insert_self_or_guardian on public.health_appointments for insert
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

create policy health_appointments_update_self_or_guardian on public.health_appointments for update
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

create policy health_appointments_delete_self_or_guardian on public.health_appointments for delete
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

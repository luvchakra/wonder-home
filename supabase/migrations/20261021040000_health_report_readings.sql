-- Health & Fitness: reading an attached report (story 21-012).
--
-- A health record can carry its report (`health_records.file_path`, in the
-- private `health-records` bucket). Once a person asks, WonderHome's AI reads
-- what the report prints -- each test's name, value, unit, the report's own
-- range and flag, with the words it was read from -- and a deterministic
-- validator keeps only what the report supports. That reading is kept here,
-- one row per reading, newest shown.
--
-- Visible exactly as its record is: the record's own `wh.may_see_health`
-- (the person, a guardian, a consented viewer, or everyone for
-- household_operational). Written only by the record's person or their
-- guardian, as themselves. Never updated: reading again adds a newer row.
-- Deleted by the same writers when the report it read is replaced or
-- removed. A reading names the file it read, so a replaced report never
-- shows the old file's reading.
--
-- Policies use the set forms (CLAUDE.md, "Row-level security checks
-- membership as a set"), evaluated once per statement.

create table public.health_record_readings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  record_id uuid not null references public.health_records(id) on delete cascade,
  -- The object this reading read; a record whose file_path differs has a newer report.
  file_path text not null check (length(trim(file_path)) between 1 and 400),
  -- The validated findings only, as the screen shows them -- never the model's raw output.
  findings jsonb not null default '[]'::jsonb check (jsonb_typeof(findings) = 'array'),
  test_date date,
  -- 'text': each finding was checked against the report's own text; 'quote': read from a picture.
  checked_against text not null default 'text' check (checked_against in ('text', 'quote')),
  instructions_ignored boolean not null default false,
  dropped_count integer not null default 0 check (dropped_count >= 0),
  provider text not null check (provider in ('anthropic', 'google', 'openai')),
  model text not null check (length(trim(model)) between 1 and 120),
  read_at timestamptz not null default now(),
  created_by_member_id uuid references public.household_members(id) on delete set null
);

comment on table public.health_record_readings is
  'What an attached health report prints, as WonderHome''s AI read it and a validator kept it (story 21-012). Visible exactly as its record; never a diagnosis.';

alter table public.health_record_readings enable row level security;

create index health_record_readings_record_idx on public.health_record_readings (record_id, read_at desc);
create index health_record_readings_household_idx on public.health_record_readings (household_id, read_at desc);
create index health_record_readings_created_by_idx on public.health_record_readings (created_by_member_id);

create policy health_record_readings_select_visible on public.health_record_readings for select
  to authenticated
  using (
    household_id in (select wh.member_households())
    and exists (
      select 1 from public.health_records r
      where r.id = health_record_readings.record_id
        and r.household_id = health_record_readings.household_id
        and wh.may_see_health(r.household_id, r.member_id, r.privacy_scope)
    )
  );

create policy health_record_readings_insert_self_or_guardian on public.health_record_readings for insert
  to authenticated
  with check (
    (household_id, created_by_member_id) in (select mm.household_id, mm.member_id from wh.my_memberships() mm)
    and exists (
      select 1 from public.health_records r
      where r.id = health_record_readings.record_id
        and r.household_id = health_record_readings.household_id
        and r.file_path = health_record_readings.file_path
        and (
          (r.household_id, r.member_id) in (select mm.household_id, mm.member_id from wh.my_memberships() mm)
          or exists (
            select 1 from public.member_guardians g
            where g.child_member_id = r.member_id
              and (r.household_id, g.guardian_member_id) in (select mm.household_id, mm.member_id from wh.my_memberships() mm)
          )
        )
    )
  );

create policy health_record_readings_delete_self_or_guardian on public.health_record_readings for delete
  to authenticated
  using (
    household_id in (select wh.member_households())
    and exists (
      select 1 from public.health_records r
      where r.id = health_record_readings.record_id
        and r.household_id = health_record_readings.household_id
        and (
          (r.household_id, r.member_id) in (select mm.household_id, mm.member_id from wh.my_memberships() mm)
          or exists (
            select 1 from public.member_guardians g
            where g.child_member_id = r.member_id
              and (r.household_id, g.guardian_member_id) in (select mm.household_id, mm.member_id from wh.my_memberships() mm)
          )
        )
    )
  );

-- No update policy: a reading is a record of what was read, never edited.

notify pgrst, 'reload schema';

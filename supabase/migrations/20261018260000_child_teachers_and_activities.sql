-- A child's teachers and their classes outside school (stories 08-010, 08-011, 08-012).
--
-- The owner, 2026-10-18: on Kids & School, per child, the class teacher and
-- every subject teacher by name; and every class outside school — music,
-- piano, karate, any learning class — as a folded row showing the class, a
-- short description and its timings, which opens onto the teacher, where it
-- is, notes, upcoming competitions and medals won. A class that meets today
-- is on the Calendar without anyone adding it (08-012 reads `days`,
-- `starts_at` and `ends_at` as a weekly schedule; nothing is copied into
-- `family_events`).
--
-- Access follows school data (`wh.may_see_child`): the child, their
-- guardians and Admins read; guardians and Admins write. A child reads their
-- own teachers and classes but does not change them. A row's child must be a
-- child of the same household. Nothing is hard-deleted from the app: a
-- teacher or a class is stood down (`active = false`) and keeps its notes.
--
-- Rollback: drop table public.child_activity_notes, public.child_activities,
-- public.school_teachers; drop function wh.may_change_child.

create or replace function wh.may_change_child(p_household_id uuid, p_child_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    wh.is_household_admin(p_household_id)
    or exists (
      select 1 from public.member_guardians g
      where g.child_member_id = p_child_member_id
        and g.guardian_member_id = wh.member_id(p_household_id)
    );
$$;

comment on function wh.may_change_child is
  'Whether the caller may change a child''s school details and classes: their guardians or an Admin (not the child).';

create or replace function wh.is_child_of(p_household_id uuid, p_child_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.id = p_child_member_id and m.household_id = p_household_id and m.member_type = 'child'
  );
$$;

comment on function wh.is_child_of is 'Whether a member is a child of this household.';

-- Teachers -------------------------------------------------------------------

create table public.school_teachers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  child_member_id uuid not null references public.household_members(id) on delete cascade,
  role text not null check (role in ('class_teacher', 'subject_teacher')),
  -- The subject a subject teacher teaches; null for the class teacher.
  subject text check (subject is null or length(trim(subject)) between 1 and 80),
  name text not null check (length(trim(name)) between 1 and 120),
  contact text check (contact is null or length(trim(contact)) <= 160),
  note text check (note is null or length(trim(note)) <= 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_teachers_subject_for_subject_teacher check (role = 'class_teacher' or subject is not null)
);

comment on table public.school_teachers is
  'A child''s class teacher and subject teachers, by name. Read by the child, guardians and Admins; written by guardians and Admins.';

create index school_teachers_child_idx on public.school_teachers (household_id, child_member_id) where active;

create trigger school_teachers_set_updated_at
  before update on public.school_teachers
  for each row execute function wh.set_updated_at();

alter table public.school_teachers enable row level security;

create policy school_teachers_select on public.school_teachers for select
  to authenticated using (wh.is_member(household_id) and wh.may_see_child(household_id, child_member_id));

create policy school_teachers_insert on public.school_teachers for insert
  to authenticated
  with check (wh.may_change_child(household_id, child_member_id) and wh.is_child_of(household_id, child_member_id));

create policy school_teachers_update on public.school_teachers for update
  to authenticated
  using (wh.may_change_child(household_id, child_member_id))
  with check (wh.may_change_child(household_id, child_member_id) and wh.is_child_of(household_id, child_member_id));

-- Classes outside school -----------------------------------------------------

create table public.child_activities (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  child_member_id uuid not null references public.household_members(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  -- Picked from a list with its own way to add one (rule 20): music, sport…
  kind text not null default 'other' check (length(trim(kind)) between 1 and 40),
  description text check (description is null or length(trim(description)) <= 300),
  teacher_name text check (teacher_name is null or length(trim(teacher_name)) <= 120),
  teacher_contact text check (teacher_contact is null or length(trim(teacher_contact)) <= 160),
  -- Where it is: picked from Google Maps (re-read on the server) or typed.
  place_name text check (place_name is null or length(trim(place_name)) <= 200),
  place_id text check (place_id is null or length(place_id) between 1 and 300),
  place_address text check (place_address is null or length(trim(place_address)) <= 300),
  latitude numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  -- The weekly schedule: ISO weekdays (1 Monday … 7 Sunday) and the local
  -- times on the household's clock. Empty days means no fixed schedule.
  days smallint[] not null default '{}' check (days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  starts_at time,
  ends_at time,
  starts_on date,
  ends_on date,
  notes text check (notes is null or length(trim(notes)) <= 2000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint child_activities_times_ordered check (starts_at is null or ends_at is null or starts_at < ends_at),
  constraint child_activities_dates_ordered check (starts_on is null or ends_on is null or starts_on <= ends_on),
  constraint child_activities_place_point check ((latitude is null) = (longitude is null))
);

comment on table public.child_activities is
  'A class a child goes to outside school (music, karate, a learning class), with its weekly schedule. Read by the child, guardians and Admins; written by guardians and Admins.';

create index child_activities_child_idx on public.child_activities (household_id, child_member_id) where active;

create trigger child_activities_set_updated_at
  before update on public.child_activities
  for each row execute function wh.set_updated_at();

alter table public.child_activities enable row level security;

create policy child_activities_select on public.child_activities for select
  to authenticated using (wh.is_member(household_id) and wh.may_see_child(household_id, child_member_id));

create policy child_activities_insert on public.child_activities for insert
  to authenticated
  with check (wh.may_change_child(household_id, child_member_id) and wh.is_child_of(household_id, child_member_id));

create policy child_activities_update on public.child_activities for update
  to authenticated
  using (wh.may_change_child(household_id, child_member_id))
  with check (wh.may_change_child(household_id, child_member_id) and wh.is_child_of(household_id, child_member_id));

-- What a class holds besides its schedule: a competition coming up, a medal
-- or award won, or a note about the class.
create table public.child_activity_notes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  activity_id uuid not null references public.child_activities(id) on delete cascade,
  kind text not null check (kind in ('competition', 'award', 'note')),
  title text not null check (length(trim(title)) between 1 and 200),
  on_date date,
  detail text check (detail is null or length(trim(detail)) <= 1000),
  -- An award's result, e.g. "Gold" or "Grade 3, distinction".
  result text check (result is null or length(trim(result)) <= 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.child_activity_notes is
  'A class''s competitions, awards won and notes. Follows its class''s access.';

create index child_activity_notes_activity_idx on public.child_activity_notes (activity_id) where active;

create trigger child_activity_notes_set_updated_at
  before update on public.child_activity_notes
  for each row execute function wh.set_updated_at();

alter table public.child_activity_notes enable row level security;

create policy child_activity_notes_select on public.child_activity_notes for select
  to authenticated
  using (
    exists (
      select 1 from public.child_activities a
      where a.id = activity_id and a.household_id = child_activity_notes.household_id
        and wh.is_member(a.household_id) and wh.may_see_child(a.household_id, a.child_member_id)
    )
  );

create policy child_activity_notes_insert on public.child_activity_notes for insert
  to authenticated
  with check (
    exists (
      select 1 from public.child_activities a
      where a.id = activity_id and a.household_id = child_activity_notes.household_id
        and wh.may_change_child(a.household_id, a.child_member_id)
    )
  );

create policy child_activity_notes_update on public.child_activity_notes for update
  to authenticated
  using (
    exists (
      select 1 from public.child_activities a
      where a.id = activity_id and a.household_id = child_activity_notes.household_id
        and wh.may_change_child(a.household_id, a.child_member_id)
    )
  )
  with check (
    exists (
      select 1 from public.child_activities a
      where a.id = activity_id and a.household_id = child_activity_notes.household_id
        and wh.may_change_child(a.household_id, a.child_member_id)
    )
  );


notify pgrst, 'reload schema';

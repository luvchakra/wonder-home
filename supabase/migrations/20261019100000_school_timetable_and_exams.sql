-- A child's school timetable and exams (story 08-015).
--
-- The owner, 2026-10-18: a weekly timetable per child, and an Exams section
-- where the household creates exam types (unit test, mid-term, finals, their
-- own), each exam with its subjects, and each subject with its date, time,
-- syllabus and links to material; on the calendar.
--
-- - `school_timetable_periods`: one row per period of a child's week (ISO
--   weekday, local start and end on the household's clock, the subject, and
--   optionally the teacher and the room). Read as a weekly schedule, like a
--   class outside school; nothing is copied into `family_events`.
-- - `school_exam_types`: the household's own kinds of exam, beyond the ones
--   the app offers (Unit test, Mid-term, Finals). Any adult may add one.
-- - `school_exams`: one exam for one child, of a type, e.g. "Mid-term".
-- - `school_exam_papers`: each subject of an exam on its own day and time,
--   with what it covers and links to material. Each paper is on the calendar
--   on its day.
--
-- Access follows school data, as a child's classes do: the child, their
-- guardians and Admins read; guardians and Admins write (`wh.may_change_child`).
-- Nothing is hard-deleted from the app: a row is stood down (`active = false`).
--
-- Rollback: drop table public.school_exam_papers, public.school_exams,
-- public.school_exam_types, public.school_timetable_periods.

-- Timetable ------------------------------------------------------------------

create table public.school_timetable_periods (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  child_member_id uuid not null references public.household_members(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  starts_at time not null,
  ends_at time not null,
  subject text not null check (length(trim(subject)) between 1 and 80),
  teacher_name text check (teacher_name is null or length(trim(teacher_name)) <= 120),
  room text check (room is null or length(trim(room)) <= 60),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_timetable_periods_times_ordered check (starts_at < ends_at)
);

comment on table public.school_timetable_periods is
  'One period of a child''s weekly school timetable. Read by the child, guardians and Admins; written by guardians and Admins.';

create index school_timetable_periods_child_idx on public.school_timetable_periods (household_id, child_member_id, weekday, starts_at) where active;

create trigger school_timetable_periods_set_updated_at
  before update on public.school_timetable_periods
  for each row execute function wh.set_updated_at();

alter table public.school_timetable_periods enable row level security;

create policy school_timetable_periods_select on public.school_timetable_periods for select
  to authenticated using (wh.is_member(household_id) and wh.may_see_child(household_id, child_member_id));

create policy school_timetable_periods_insert on public.school_timetable_periods for insert
  to authenticated
  with check (wh.may_change_child(household_id, child_member_id) and wh.is_child_of(household_id, child_member_id));

create policy school_timetable_periods_update on public.school_timetable_periods for update
  to authenticated
  using (wh.may_change_child(household_id, child_member_id))
  with check (wh.may_change_child(household_id, child_member_id) and wh.is_child_of(household_id, child_member_id));

-- Exam types -----------------------------------------------------------------

create table public.school_exam_types (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.school_exam_types is
  'A household''s own kinds of exam, beyond the app''s Unit test, Mid-term and Finals. Every member reads them; any adult adds one.';

create unique index school_exam_types_name_key on public.school_exam_types (household_id, lower(trim(name))) where active;

create trigger school_exam_types_set_updated_at
  before update on public.school_exam_types
  for each row execute function wh.set_updated_at();

alter table public.school_exam_types enable row level security;

create policy school_exam_types_select on public.school_exam_types for select
  to authenticated using (wh.is_member(household_id));

create policy school_exam_types_insert on public.school_exam_types for insert
  to authenticated
  with check (
    exists (
      select 1 from public.household_members m
      where m.id = wh.member_id(school_exam_types.household_id) and m.member_type = 'adult'
    )
  );

create policy school_exam_types_update on public.school_exam_types for update
  to authenticated
  using (
    exists (
      select 1 from public.household_members m
      where m.id = wh.member_id(school_exam_types.household_id) and m.member_type = 'adult'
    )
  )
  with check (
    exists (
      select 1 from public.household_members m
      where m.id = wh.member_id(school_exam_types.household_id) and m.member_type = 'adult'
    )
  );

-- Exams ----------------------------------------------------------------------

create table public.school_exams (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  child_member_id uuid not null references public.household_members(id) on delete cascade,
  -- The type's name as picked: one of the app's or one of the household's own.
  exam_type text not null check (length(trim(exam_type)) between 1 and 60),
  -- An optional name of its own, e.g. "Term 1".
  title text check (title is null or length(trim(title)) <= 120),
  notes text check (notes is null or length(trim(notes)) <= 2000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.school_exams is
  'One exam for one child (a unit test, a mid-term…). Its subjects are school_exam_papers. Read by the child, guardians and Admins; written by guardians and Admins.';

create index school_exams_child_idx on public.school_exams (household_id, child_member_id) where active;

create trigger school_exams_set_updated_at
  before update on public.school_exams
  for each row execute function wh.set_updated_at();

alter table public.school_exams enable row level security;

create policy school_exams_select on public.school_exams for select
  to authenticated using (wh.is_member(household_id) and wh.may_see_child(household_id, child_member_id));

create policy school_exams_insert on public.school_exams for insert
  to authenticated
  with check (wh.may_change_child(household_id, child_member_id) and wh.is_child_of(household_id, child_member_id));

create policy school_exams_update on public.school_exams for update
  to authenticated
  using (wh.may_change_child(household_id, child_member_id))
  with check (wh.may_change_child(household_id, child_member_id) and wh.is_child_of(household_id, child_member_id));

-- Exam papers: one subject of an exam, on its day ----------------------------

create table public.school_exam_papers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  exam_id uuid not null references public.school_exams(id) on delete cascade,
  subject text not null check (length(trim(subject)) between 1 and 80),
  on_date date not null,
  starts_at time,
  ends_at time,
  -- What it covers, as the school sent it.
  syllabus text check (syllabus is null or length(trim(syllabus)) <= 4000),
  -- Links to material: web addresses only, at most ten.
  links text[] not null default '{}' check (cardinality(links) <= 10),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_exam_papers_times_ordered check (starts_at is null or ends_at is null or starts_at < ends_at)
);

comment on table public.school_exam_papers is
  'One subject of an exam on its day and time, with its syllabus and links to material. On the calendar on its day. Follows its exam''s access.';

create index school_exam_papers_exam_idx on public.school_exam_papers (exam_id, on_date) where active;
create index school_exam_papers_household_day_idx on public.school_exam_papers (household_id, on_date) where active;

create trigger school_exam_papers_set_updated_at
  before update on public.school_exam_papers
  for each row execute function wh.set_updated_at();

-- Every link is a web address (checked here; the app checks it too).
create or replace function wh.assert_exam_paper_links() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  link text;
begin
  foreach link in array new.links loop
    if link !~ '^https?://[^[:space:]]+$' or length(link) > 500 then
      raise exception 'a material link must be a web address' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

create trigger school_exam_papers_links_are_web
  before insert or update of links on public.school_exam_papers
  for each row execute function wh.assert_exam_paper_links();

alter table public.school_exam_papers enable row level security;

create policy school_exam_papers_select on public.school_exam_papers for select
  to authenticated
  using (
    exists (
      select 1 from public.school_exams e
      where e.id = exam_id and e.household_id = school_exam_papers.household_id
        and wh.is_member(e.household_id) and wh.may_see_child(e.household_id, e.child_member_id)
    )
  );

create policy school_exam_papers_insert on public.school_exam_papers for insert
  to authenticated
  with check (
    exists (
      select 1 from public.school_exams e
      where e.id = exam_id and e.household_id = school_exam_papers.household_id
        and wh.may_change_child(e.household_id, e.child_member_id)
    )
  );

create policy school_exam_papers_update on public.school_exam_papers for update
  to authenticated
  using (
    exists (
      select 1 from public.school_exams e
      where e.id = exam_id and e.household_id = school_exam_papers.household_id
        and wh.may_change_child(e.household_id, e.child_member_id)
    )
  )
  with check (
    exists (
      select 1 from public.school_exams e
      where e.id = exam_id and e.household_id = school_exam_papers.household_id
        and wh.may_change_child(e.household_id, e.child_member_id)
    )
  );

-- HomeBrain's stored household context is marked stale on any write here
-- too (HomeBrain 4.0 §3.8, `wh.mark_context_stale`).
do $tables$
declare
  name text;
begin
  foreach name in array array['school_timetable_periods', 'school_exam_types', 'school_exams', 'school_exam_papers'] loop
    execute format(
      'create or replace trigger %I after insert or update or delete on public.%I for each row execute function wh.mark_context_stale()',
      name || '_marks_context_stale', name
    );
  end loop;
end;
$tables$;

notify pgrst, 'reload schema';

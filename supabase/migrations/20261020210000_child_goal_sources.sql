-- A goal set from something already on record (the owner, 2026-10-20: "use
-- existing entries for school and extra classes to define the goals and
-- decide a reward on meeting the goals"). A goal may say what it was made
-- from: a class outside school (`child_activities`) or a piece of school
-- work (`school_items`). A school-work goal is met when that work is marked
-- done; a class goal is checked in after each class, as any goal is.
-- Nothing else changes: guardians and Admins still set goals (RLS as before).

alter table public.child_goals
  add column if not exists source_kind text check (source_kind is null or source_kind in ('activity', 'school_item')),
  add column if not exists source_id uuid,
  add constraint child_goals_source_pair check ((source_kind is null) = (source_id is null));

create index if not exists child_goals_source_idx on public.child_goals (source_id) where source_id is not null;

comment on column public.child_goals.source_kind is
  'What the goal was set from: activity (a class outside school) or school_item (a piece of school work, met when it is marked done).';

notify pgrst, 'reload schema';

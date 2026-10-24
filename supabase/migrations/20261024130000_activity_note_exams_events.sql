-- A class outside school has more than competitions coming up: a grading or
-- belt exam, a performance, a match (the owner's karate exam sent on
-- WhatsApp, 2026-10-24). Each may have a time on the household's clock, and
-- each dated one is on the Calendar like the class's own sessions.
alter table public.child_activity_notes drop constraint if exists child_activity_notes_kind_check;
alter table public.child_activity_notes
  add constraint child_activity_notes_kind_check check (kind in ('competition', 'exam', 'event', 'award', 'note'));

alter table public.child_activity_notes
  add column if not exists starts_at time,
  add column if not exists ends_at time;

alter table public.child_activity_notes drop constraint if exists child_activity_notes_times_ordered;
alter table public.child_activity_notes
  add constraint child_activity_notes_times_ordered check (starts_at is null or ends_at is null or starts_at < ends_at);

comment on table public.child_activity_notes is
  'A class''s competitions, exams and events coming up (with an optional time), awards won and notes. Follows its class''s access.';

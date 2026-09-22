-- Letting a household record more than one engagement for the same
-- househelper (module 07 follow-up).
--
-- `helper_profiles` had `unique (member_id)`, so a person who already helps
-- with, say, regular housekeeping could never get a second, distinct
-- arrangement recorded (occasional cooking on different days, or a second
-- service visit) — every save silently overwrote the one row that existed.
-- The row's own `id` was already the real identity (RLS, the update/delete
-- paths below, and every FK elsewhere key off it, never off `member_id`
-- directly), so dropping the constraint is enough: many engagements can
-- now exist for the same member, each its own row with its own kind,
-- start date and notes.

alter table public.helper_profiles drop constraint helper_profiles_member_id_key;

comment on table public.helper_profiles is
  'A househelper''s arrangement(s) with the household — one member can have more than one distinct engagement. Deliberately holds no productivity data: this is not an employee monitoring system.';

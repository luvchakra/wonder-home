-- School hours and office hours (HomePlaces follow-up).
--
-- HomePlaces used to assume school ends at 3:30 pm and said so. A child's
-- school now carries its own start and end time, on the enrolment, and an
-- adult's working day carries the hours they keep, on the member. "After
-- school" and "after work" read these; when they are blank the assumption
-- is still said aloud, never hidden.
--
-- Both are optional and both come as a pair: a start without an end says
-- nothing usable. A school day never runs past midnight; a working day may
-- (a night shift), so only an equal start and end is refused there. Only an
-- adult keeps office hours; a househelper's day is their own schedule.
-- Who may write them is unchanged: the existing member and enrolment
-- policies already decide that.

alter table public.household_members
  add column work_starts_at time,
  add column work_ends_at time,
  add constraint household_members_work_hours_pair
    check ((work_starts_at is null) = (work_ends_at is null)),
  add constraint household_members_work_hours_span
    check (work_starts_at is null or work_starts_at <> work_ends_at),
  add constraint household_members_work_hours_adult
    check (work_starts_at is null or member_type = 'adult');

comment on column public.household_members.work_starts_at is
  'When this adult''s working day usually starts, on the household''s clock. Shapes suggestions ("after work"); never a permission.';
comment on column public.household_members.work_ends_at is
  'When this adult''s working day usually ends, on the household''s clock. May be earlier than the start for a night shift.';

alter table public.school_enrolments
  add column starts_at time,
  add column ends_at time,
  add constraint school_enrolments_hours_pair
    check ((starts_at is null) = (ends_at is null)),
  add constraint school_enrolments_hours_span
    check (starts_at is null or ends_at > starts_at);

comment on column public.school_enrolments.starts_at is
  'When the school day starts for this child, on the household''s clock.';
comment on column public.school_enrolments.ends_at is
  'When the school day ends for this child: what "after school" means in HomePlaces.';

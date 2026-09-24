-- Smart notifications, part 3 (module 23, stories 23-008, 23-010..23-012).
--
-- 1. A child's school things due the same day become one reminder. Its
--    source is the child (a real record, the same for every item in it); the
--    items it stands for are named in its decision factors.
alter table public.notifications drop constraint notifications_source_type_check;
alter table public.notifications add constraint notifications_source_type_check
  check (source_type in ('obligation', 'school_item', 'school_day', 'meal', 'grocery_list', 'pet_care_need', 'family_event',
                         'health_appointment', 'health_routine', 'health_checkup', 'approval', 'reminder'));

-- 2. Two choices each person makes for themselves, on their own in-app row:
--    whether the day's summary is shown (on unless turned off), and whether
--    WonderHome may learn when they usually act (off unless turned on — a
--    person asks for it; it is never assumed).
alter table public.notification_preferences
  add column daily_digest boolean not null default true,
  add column learn_timing boolean not null default false;

comment on column public.notification_preferences.learn_timing is
  'Whether the first reminder of a kind may move to when this person usually acts on it. Never over a timing they chose themselves.';

notify pgrst, 'reload schema';

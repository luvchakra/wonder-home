-- A morning digest on a channel (story 27-008).
--
-- Opt-in per channel, at a time the person picks on the household's clock.
-- `digest_last_on` is the local day it last went, which is what makes a tick of
-- the delivery clock safe to repeat: the day is claimed before anything is sent.
-- The digest itself is kept as a resolved notification (source 'digest'), so
-- every send leaves its closed-word events like any other.

alter table public.notification_preferences
  add column if not exists digest boolean not null default false,
  add column if not exists digest_minute smallint not null default 450 check (digest_minute between 0 and 1439),
  add column if not exists digest_last_on date;

comment on column public.notification_preferences.digest is
  'Whether this channel carries one morning message with the day''s reminders (story 27-008). Never true for the in-app channel.';

alter table public.notification_preferences
  add constraint notification_preferences_digest_not_in_app check (not digest or channel <> 'in_app');

alter table public.notifications drop constraint notifications_source_type_check;
alter table public.notifications add constraint notifications_source_type_check
  check (source_type in ('obligation', 'school_item', 'school_day', 'meal', 'grocery_list', 'pet_care_need', 'family_event',
                         'health_appointment', 'health_routine', 'health_checkup', 'approval', 'reminder',
                         'payment', 'payment_refund',
                         'homesend_item', 'event_replies', 'helper_absence', 'grocery_order', 'event_change', 'weather_plan',
                         'digest'));

create index if not exists notification_preferences_digest_idx on public.notification_preferences (household_id) where digest;

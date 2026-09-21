-- A channel-specific address for delivery (story 06-008).
--
-- In-app needs nothing (the notification row is the delivery) and email
-- resolves from auth.users, which every member with an account already has.
-- Push and WhatsApp need somewhere to actually send to — a push subscription
-- reference or a phone number — and that address belongs to the same row a
-- member already controls their own quiet hours and enabled/disabled state
-- from (`notification_preferences_write_own`), not to `household_members`,
-- which only an Admin may edit. A person sets their own contact address for
-- their own notifications.
--
-- `target` is free text on purpose: a push channel's address is an opaque
-- subscription reference, not a phone number, so one shared format would fit
-- neither. WhatsApp's is checked as E.164 because that one *does* have a
-- single real shape and a household typo there should fail loudly, not sit
-- silently unreachable.
alter table public.notification_preferences
  add column target text check (
    target is null
    or channel <> 'whatsapp'
    or target ~ '^\+[1-9]\d{1,14}$'
  );

comment on column public.notification_preferences.target is
  'The channel-specific address to deliver to: a phone number for whatsapp, an opaque subscription reference for push. Null for in_app and email, which need no address stored here.';

notify pgrst, 'reload schema';

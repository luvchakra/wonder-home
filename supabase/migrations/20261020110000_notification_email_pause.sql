-- Email that stops trying an address the mail server keeps refusing (story 27-009).
--
-- A channel switched off by the system, not by the person, has to say so:
-- `paused_reason` is the closed word for why, `paused_at` when. Delivery sets
-- both together with `enabled = false`; the person's next save of the channel
-- clears them. Nothing here holds an address or a message.

alter table public.notification_preferences
  add column if not exists paused_reason text check (paused_reason in ('address_rejected')),
  add column if not exists paused_at timestamptz;

comment on column public.notification_preferences.paused_reason is
  'Why delivery switched this channel off on its own, in closed words (story 27-009). Null when the person controls it.';

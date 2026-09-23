-- Story 17-006: notifications that leave the app.
--
-- A notification sent to WhatsApp (or any channel beyond the app) is
-- `sent` when the provider accepts it, and its later delivery report makes
-- it `delivered`, `seen` or `delivery_failed`. The provider's message id is
-- kept in the event's metadata — nothing of the message itself — and indexed,
-- so a delivery report finds its notification without a scan.

alter table public.notification_events drop constraint notification_events_event_type_check;
alter table public.notification_events add constraint notification_events_event_type_check check (event_type in
  ('generated', 'sent', 'delivered', 'delivery_failed', 'seen', 'acted', 'resolved', 'expired', 'escalated', 'suppressed'));

create index notification_events_provider_message_idx
  on public.notification_events ((metadata ->> 'providerMessageId'))
  where metadata ? 'providerMessageId';

notify pgrst, 'reload schema';

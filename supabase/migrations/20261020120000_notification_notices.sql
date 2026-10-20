-- Notices: notifications about something that happened, not a timed reminder (stories 27-004 to 27-014).
--
-- A reminder is derived from a record that still needs someone (module 23). A
-- notice is derived the same way, from the record that says something has
-- happened and is still true: a HomeSend item waiting for a yes, a guest's
-- reply, a helper who will not be in, an order on its way. One thread per
-- record, resolved when the record settles, so the notifications table never
-- holds a line of text fired and forgotten.

alter table public.notifications drop constraint notifications_source_type_check;
alter table public.notifications add constraint notifications_source_type_check
  check (source_type in ('obligation', 'school_item', 'school_day', 'meal', 'grocery_list', 'pet_care_need', 'family_event',
                         'health_appointment', 'health_routine', 'health_checkup', 'approval', 'reminder',
                         'payment', 'payment_refund',
                         'homesend_item', 'event_replies', 'helper_absence', 'grocery_order', 'event_change', 'weather_plan'));

-- The delivery clock looks for what changed since its last tick; each of these is
-- a plain "recently changed" read across households.
create index if not exists home_send_items_updated_idx on public.home_send_items (updated_at desc);
create index if not exists event_guests_updated_idx on public.event_guests (updated_at desc);
create index if not exists orders_updated_idx on public.orders (updated_at desc);
create index if not exists availability_exceptions_created_idx on public.availability_exceptions (created_at desc);

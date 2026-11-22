-- A `not_configured` WhatsApp event now says which settings read as unset and
-- whether the server had read Platform admin's saved settings at all
-- (2026-11-22 outage: one bare `not_configured` and nothing else to go on).
-- Names only, never a value. Safe in either order: until these columns exist,
-- `whatsapp/events.ts` writes the event without them.

alter table public.whatsapp_events add column if not exists missing_settings text[];
alter table public.whatsapp_events add column if not exists settings_store text;

alter table public.whatsapp_events drop constraint if exists whatsapp_events_missing_settings_check;
alter table public.whatsapp_events add constraint whatsapp_events_missing_settings_check
  check (missing_settings is null or (cardinality(missing_settings) <= 20 and array_to_string(missing_settings, ',') ~ '^([A-Z][A-Z0-9_]{2,80}(,|$))*$'));

alter table public.whatsapp_events drop constraint if exists whatsapp_events_settings_store_check;
alter table public.whatsapp_events add constraint whatsapp_events_settings_store_check
  check (settings_store is null or settings_store in ('loaded', 'not_loaded', 'no_loader'));

comment on column public.whatsapp_events.missing_settings is 'not_configured only: names of the WhatsApp settings that read as unset. Never a value.';
comment on column public.whatsapp_events.settings_store is 'not_configured only: loaded | not_loaded | no_loader — whether the server had read the saved platform settings.';

-- HomeSend email intake, two fixes found by the 2026-11-14 live NSR run.
--
-- 1. `createEmailHomeSendItem` upserts with `on conflict (household_id,
--    external_id) do nothing`. The unique index it relies on was partial
--    (`where external_id is not null`), and Postgres refuses an ON CONFLICT
--    target that names no predicate against a partial index (42P10), so
--    every forwarded email, trusted or held for "Trust this sender?", failed
--    before it was kept. A plain unique index enforces the same thing: NULLs
--    stay distinct, so items without an external id are unaffected.
create unique index if not exists home_send_items_household_external_id_key
  on public.home_send_items (household_id, external_id);
drop index if exists public.home_send_items_external_id_idx;

-- 2. The closed words for email telemetry lacked `dropped_not_allowlisted`
--    (story 17-016), so any delivery that recorded it lost its whole batch
--    of events, `delivered` included.
alter table public.homesend_email_events drop constraint if exists homesend_email_events_kind_check;
alter table public.homesend_email_events add constraint homesend_email_events_kind_check check (kind in (
  'delivered',
  'signature_failed',
  'unrouted',
  'dropped_not_allowlisted',
  'duplicate',
  'fetch_failed',
  'attachment_failed',
  'attachment_too_large',
  'classification_failed',
  'processed',
  'rate_limited',
  'retry_queued'
));

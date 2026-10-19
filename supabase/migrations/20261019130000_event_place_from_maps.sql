-- An event's place, picked from Google Maps (the owner, 2026-10-19).
--
-- "Where" on a family event was free text only. It can now be a place picked
-- from Google Maps, as the home address, a school and an office already are.
-- The server re-reads the picked place by its id before saving, so the name
-- and address come from the provider, never from the browser:
--   location           — what is shown (the place's name, or what was typed)
--   location_address   — the place's address, when it was picked
--   location_place_id  — Google's place id, so the event opens in Google Maps
-- A typed place ("Home", "Nani's house") keeps both new columns empty.
-- Both follow the event's own row-level security; a busy-only view
-- (wh.busy_windows) still never returns any of them.

alter table public.family_events
  add column if not exists location_place_id text
    check (location_place_id is null or (length(location_place_id) between 1 and 300 and location_place_id ~ '^[A-Za-z0-9_-]+$')),
  add column if not exists location_address text
    check (location_address is null or length(trim(location_address)) <= 300);

comment on column public.family_events.location_place_id is
  'Google Maps place id of the event''s place when it was picked from the search, re-read on the server; null for a typed place.';
comment on column public.family_events.location_address is
  'The picked place''s address as Google Maps gives it; null for a typed place.';

notify pgrst, 'reload schema';

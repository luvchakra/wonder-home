-- Make the connection-keyed unique indexes non-partial (Connections framework fix).
--
-- 20261028140000 created these as PARTIAL unique indexes (`where connection_id is
-- not null`). But the worker upserts into them keyed only on the columns, with no
-- matching WHERE predicate:
--   * portal_sessions:       on conflict (connection_id)
--   * portal_fetch_cursors:  on conflict (connection_id, scrape_url, item_hash)
-- Postgres can't use a partial unique index as the arbiter of such an ON CONFLICT
-- (PostgREST surfaces it as 42P10, "no unique or exclusion constraint matching the
-- ON CONFLICT specification"), so every connection fetch failed at
-- `connectionSessionStore.save`.
--
-- A plain (non-partial) unique index fixes it and is safe here: NULLs are distinct
-- in a unique index, so the many integration rows (connection_id IS NULL) still
-- never collide with each other.

drop index if exists public.portal_sessions_connection;
create unique index portal_sessions_connection on public.portal_sessions (connection_id);

drop index if exists public.portal_fetch_cursors_connection_unique;
create unique index portal_fetch_cursors_connection_unique on public.portal_fetch_cursors (connection_id, scrape_url, item_hash);

notify pgrst, 'reload schema';

-- Portal fetch: scrape URLs, persisted sessions, idempotency cursors (story 08-033).
--
-- The generic portal connector signs into a household's portal headlessly, reads
-- the post-auth pages they listed, and files what it finds through HomeSend. Three
-- tables back that, each with the access model its contents deserve:
--
--  * portal_scrape_urls — which post-auth pages to read. Connection config an
--    Admin manages; members may see which pages are tracked (child-gated when a
--    page is one child's). Not secret.
--  * portal_sessions — the persisted browser session (cookies/tokens) so scheduled
--    runs reuse a login instead of signing in every time. A credential: NO select
--    for anyone reachable from a browser; the worker reads it with the service role.
--    A status function says only whether a portal is connected, never the session.
--  * portal_fetch_cursors — hashes of items already filed, so a twice-daily run
--    never re-files the same homework or message. Operational; service-role only.
--
-- A portal is read-only and never an authorization channel. What it brings in is
-- untrusted content and becomes a HomeSend item awaiting confirmation (CLAUDE.md).

-- 1. The post-auth pages a household has WonderHome read. ----------------------
create table public.portal_scrape_urls (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  integration_id uuid not null references public.integrations (id) on delete cascade,
  url text not null check (length(url) between 1 and 2048),
  kind text not null default 'generic' check (kind in ('homework', 'calendar', 'messages', 'results', 'generic')),
  -- The child this page is about, when it is one child's; null for a shared page.
  child_member_id uuid references public.household_members (id) on delete set null,
  enabled boolean not null default true,
  created_by uuid references public.household_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.portal_scrape_urls is
  'Post-auth pages of a connected portal that a household has WonderHome read. Connection config; read-only; what it brings in becomes HomeSend items awaiting confirmation.';

create unique index portal_scrape_urls_integration_url on public.portal_scrape_urls (integration_id, url);
create index portal_scrape_urls_household on public.portal_scrape_urls (household_id, integration_id);
create index portal_scrape_urls_child on public.portal_scrape_urls (child_member_id) where child_member_id is not null;
create index portal_scrape_urls_created_by on public.portal_scrape_urls (created_by);

create trigger portal_scrape_urls_set_updated_at
  before update on public.portal_scrape_urls
  for each row execute function wh.set_updated_at();

alter table public.portal_scrape_urls enable row level security;

-- Every member may see which pages are tracked; a child's page only to those who may see that child.
create policy portal_scrape_urls_select on public.portal_scrape_urls for select
  to authenticated
  using (
    household_id in (select wh.member_households())
    and (child_member_id is null or wh.may_see_child(household_id, child_member_id))
  );

-- Managing a connection is an Admin's.
create policy portal_scrape_urls_insert on public.portal_scrape_urls for insert
  to authenticated
  with check (household_id in (select wh.admin_households()));

create policy portal_scrape_urls_update on public.portal_scrape_urls for update
  to authenticated
  using (household_id in (select wh.admin_households()))
  with check (household_id in (select wh.admin_households()));

create policy portal_scrape_urls_delete on public.portal_scrape_urls for delete
  to authenticated
  using (household_id in (select wh.admin_households()));

-- 2. The persisted browser session. A credential — never readable from a browser. --
create table public.portal_sessions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  integration_id uuid not null unique references public.integrations (id) on delete cascade,
  -- The opaque storageState blob (cookies + storage). Null when a state is known but no session is held yet.
  session text check (session is null or length(session) between 1 and 1048576),
  state text not null default 'never' check (state in ('connected', 'reconnect_needed', 'never')),
  reason text check (reason is null or length(trim(reason)) between 1 and 64),
  last_ok_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.portal_sessions is
  'A connected portal''s persisted browser session (cookies/tokens). Deliberately has NO select policy and all grants revoked from authenticated: the worker reads it with the service role to reuse a login. A status function exposes only the connection state, never the session.';

create index portal_sessions_household on public.portal_sessions (household_id);

create trigger portal_sessions_set_updated_at
  before update on public.portal_sessions
  for each row execute function wh.set_updated_at();

alter table public.portal_sessions enable row level security;

-- The session is the server's alone: a deny-all policy that never yields a row,
-- the same shape webhook_deliveries / household_webhooks use. It exists so this
-- is not "no policy at all" (scripts/test-tenant-isolation-rls.mjs treats that as
-- unprotected); the worker reads the blob with the service role, which bypasses
-- RLS. No write policy, so inserts/updates/deletes from a client are denied too.
create policy portal_sessions_no_client_access on public.portal_sessions for select
  to authenticated
  using (false);

-- Whether a household's portals are connected, and why not — never the session blob. Admin only.
create or replace function public.portal_session_status(p_household_id uuid)
returns table (integration_id uuid, state text, reason text, last_ok_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.integration_id, s.state, s.reason, s.last_ok_at, s.updated_at
  from public.portal_sessions s
  where s.household_id = p_household_id
    and p_household_id in (select wh.admin_households());
$$;

comment on function public.portal_session_status is
  'A household''s portal connection states (connected / reconnect_needed / never) and why. Admin only; never returns the session blob.';

revoke all on function public.portal_session_status(uuid) from public, anon;
grant execute on function public.portal_session_status(uuid) to authenticated;

-- 3. Idempotency cursors: hashes of items already filed. Service-role only. -----
create table public.portal_fetch_cursors (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  integration_id uuid not null references public.integrations (id) on delete cascade,
  scrape_url text not null check (length(scrape_url) between 1 and 2048),
  item_hash text not null check (item_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

comment on table public.portal_fetch_cursors is
  'Hashes of portal items already filed to HomeSend, so a scheduled fetch never re-files the same item. Operational bookkeeping; written and read by the worker with the service role.';

create unique index portal_fetch_cursors_unique on public.portal_fetch_cursors (integration_id, scrape_url, item_hash);
create index portal_fetch_cursors_lookup on public.portal_fetch_cursors (integration_id, scrape_url, created_at);
create index portal_fetch_cursors_household on public.portal_fetch_cursors (household_id);

alter table public.portal_fetch_cursors enable row level security;

-- The worker's alone: the same deny-all select policy (never yields a row); the
-- service role reads and writes it, bypassing RLS. No write policy for clients.
create policy portal_fetch_cursors_no_client_access on public.portal_fetch_cursors for select
  to authenticated
  using (false);

notify pgrst, 'reload schema';

-- Generic connections (the Connections framework).
--
-- A household creates named connections, each of a connector_type the product
-- defines (browser-automation, whatsapp, …). Non-secret parameters (a url, a
-- username) live on the connection and are readable by members; secrets (a
-- password, a token) go in connection_secrets, which — like
-- school_portal_credentials and household_ai_credentials — has NO select policy
-- at all: only the server, with the service role, reads them to run a connector.
--
-- This generalises what story 08-032/08-033 built for one school portal: the
-- portal engine, scrape targets and fetch queue are not school-specific, so a
-- connection of a portal-fetch-capable type can be used by any feature (School,
-- Grocery, …) that wants to read a signed-in site.

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- The user's own name for this connection ("My daughter's school").
  name text not null check (length(trim(name)) between 1 and 80),
  -- The connector type, validated in the app against the registry
  -- (packages/core/src/connectors/registry.ts). A conservative slug check here.
  connector_type text not null check (connector_type ~ '^[a-z][a-z0-9-]{1,40}$'),
  status text not null default 'created'
    check (status in ('created', 'connected', 'reconnect_needed', 'error', 'disconnected')),
  -- Non-secret parameters only (url, username, phone, …). Never a password/token.
  params jsonb not null default '{}'::jsonb,
  created_by_member_id uuid references public.household_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.connections is
  'A household''s named connections, each of a connector_type the product defines. Holds non-secret params only; secrets live in connection_secrets. Reusable across features by capability.';

create index connections_household on public.connections (household_id);
create index connections_household_type on public.connections (household_id, connector_type);

create trigger connections_set_updated_at
  before update on public.connections
  for each row execute function wh.set_updated_at();

create trigger connections_member_valid
  before insert or update on public.connections
  for each row execute function wh.assert_meal_member_in_household('created_by_member_id');

alter table public.connections enable row level security;

-- Every member of the household sees its connections (to pick them in features);
-- creating and changing one is an administrator's act, the same bargain the
-- school portal struck for the sign-in behind it.
create policy connections_select_member on public.connections for select
  to authenticated
  using (household_id in (select wh.member_households()));

create policy connections_write_admin on public.connections for all
  to authenticated
  using (household_id in (select wh.admin_households()))
  with check (household_id in (select wh.admin_households()));

-- The secrets for a connection (password, token). Deliberately no select policy:
-- the server reads it with the service role to run the connector; nothing
-- reachable from a browser can read it at all, not even the admin who set it.
create table public.connection_secrets (
  connection_id uuid primary key references public.connections (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  secret jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.connection_secrets is
  'Secret parameters of a connection (password/token). No select policy: the server reads it with the service role; nothing reachable from a browser can read it. Never an authorization channel.';

create index connection_secrets_household on public.connection_secrets (household_id);

create trigger connection_secrets_set_updated_at
  before update on public.connection_secrets
  for each row execute function wh.set_updated_at();

alter table public.connection_secrets enable row level security;

-- An admin may write (insert/update/delete) but never read the secret back.
create policy connection_secrets_write_admin on public.connection_secrets for all
  to authenticated
  using (household_id in (select wh.admin_households()))
  with check (household_id in (select wh.admin_households()));

-- Revoke select on the table, grant it back only on the non-secret key columns so
-- an update's WHERE still resolves; the secret jsonb is never selectable.
revoke select on public.connection_secrets from authenticated;
grant select (connection_id, household_id) on public.connection_secrets to authenticated;

notify pgrst, 'reload schema';

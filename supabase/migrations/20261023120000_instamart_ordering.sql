-- Ordering the shopping list on Swiggy Instamart (story 25-032, the owner,
-- 2026-10-23: "integrate shopping cart with Swiggy Instamart to place the
-- grocery order if user decides so").
--
-- Swiggy's Instamart MCP server (https://mcp.swiggy.com/im) is reached with
-- OAuth 2.1 + PKCE on behalf of one adult, who signs in to their own Swiggy
-- account with phone + OTP on Swiggy's page. WonderHome keeps:
--   * whether a member is connected (instamart_connections, the member reads
--     their own row; only the server writes);
--   * that member's tokens (instamart_tokens, service role only — no session
--     can read a token back);
--   * the OAuth client Swiggy registered for this deployment's redirect URI,
--     and the short-lived state of a sign-in in flight (service role only).
-- An order is an ordinary orders row (provider 'Swiggy Instamart'), so the
-- existing order notices tell the person how it is going. No Swiggy address,
-- phone number or response body is stored (Swiggy's data guidelines).
--
-- Rollback: drop table public.instamart_oauth_states, public.instamart_oauth_clients,
-- public.instamart_tokens, public.instamart_connections; alter table public.order_items
-- drop column list_entry_id, drop column list_quantity, drop column list_unit;
-- alter table public.orders drop column placed_by_member_id, drop column stocked_at.

create table if not exists public.instamart_connections (
  member_id uuid primary key references public.household_members(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  status text not null default 'connected' check (status in ('connected', 'needs_reconnect', 'disconnected')),
  connected_at timestamptz not null default now(),
  last_used_at timestamptz,
  disconnected_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.instamart_connections is
  'Whether a member has connected their own Swiggy account for Instamart orders. The member reads their own row; only the server writes it.';

create index if not exists instamart_connections_household_idx on public.instamart_connections (household_id);

alter table public.instamart_connections enable row level security;

drop policy if exists instamart_connections_select_own on public.instamart_connections;
create policy instamart_connections_select_own on public.instamart_connections for select to authenticated
  using ((household_id, member_id) in (select household_id, member_id from wh.my_memberships()));

revoke insert, update, delete on public.instamart_connections from anon, authenticated;

create table if not exists public.instamart_tokens (
  member_id uuid primary key references public.household_members(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  access_token text not null check (length(access_token) between 1 and 8000),
  refresh_token text check (refresh_token is null or length(refresh_token) between 1 and 8000),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

comment on table public.instamart_tokens is
  'A member''s Swiggy OAuth tokens. Service role only: no session reads, writes or even sees a token.';

create index if not exists instamart_tokens_household_idx on public.instamart_tokens (household_id);

alter table public.instamart_tokens enable row level security;
drop policy if exists instamart_tokens_no_client_access on public.instamart_tokens;
create policy instamart_tokens_no_client_access on public.instamart_tokens for all to anon, authenticated using (false) with check (false);
revoke all on public.instamart_tokens from anon, authenticated;
-- As the other key tables: no session ever reads a token column; the rest
-- is selectable so a count still works, and the policy still returns no rows.
grant select (member_id, household_id, expires_at, updated_at) on public.instamart_tokens to authenticated;

create table if not exists public.instamart_oauth_clients (
  redirect_uri text primary key check (redirect_uri ~ '^(https://|http://localhost)'),
  client_id text not null check (length(client_id) between 1 and 400),
  created_at timestamptz not null default now()
);

comment on table public.instamart_oauth_clients is
  'The OAuth client Swiggy registered (RFC 7591) for each redirect URI this deployment uses. Platform data, service role only.';

alter table public.instamart_oauth_clients enable row level security;
drop policy if exists instamart_oauth_clients_no_client_access on public.instamart_oauth_clients;
create policy instamart_oauth_clients_no_client_access on public.instamart_oauth_clients for all to anon, authenticated using (false) with check (false);
revoke all on public.instamart_oauth_clients from anon, authenticated;

create table if not exists public.instamart_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  code_verifier text not null check (length(code_verifier) between 43 and 128),
  redirect_uri text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.instamart_oauth_states is
  'A Swiggy sign-in in flight: the hash of its state, its PKCE verifier and who started it, for ten minutes. Single use. Service role only.';

create index if not exists instamart_oauth_states_member_idx on public.instamart_oauth_states (member_id);
create index if not exists instamart_oauth_states_household_idx on public.instamart_oauth_states (household_id);
create index if not exists instamart_oauth_states_expires_idx on public.instamart_oauth_states (expires_at);

alter table public.instamart_oauth_states enable row level security;
drop policy if exists instamart_oauth_states_no_client_access on public.instamart_oauth_states;
create policy instamart_oauth_states_no_client_access on public.instamart_oauth_states for all to anon, authenticated using (false) with check (false);
revoke all on public.instamart_oauth_states from anon, authenticated;
grant select (household_id, member_id, expires_at, created_at) on public.instamart_oauth_states to authenticated;

-- Who placed an order, when its things went into stock, and which list entry
-- each line came from, so "Put into stock" closes the right lines once.
alter table public.orders add column if not exists placed_by_member_id uuid references public.household_members(id) on delete set null;
alter table public.orders add column if not exists stocked_at timestamptz;
create index if not exists orders_placed_by_idx on public.orders (placed_by_member_id);

alter table public.order_items add column if not exists list_entry_id uuid references public.shopping_list_entries(id) on delete set null;
alter table public.order_items add column if not exists list_quantity numeric(12, 3) check (list_quantity is null or list_quantity > 0);
alter table public.order_items add column if not exists list_unit text check (list_unit is null or length(trim(list_unit)) between 1 and 40);
create index if not exists order_items_list_entry_idx on public.order_items (list_entry_id);
create index if not exists order_items_consumable_idx on public.order_items (consumable_id);

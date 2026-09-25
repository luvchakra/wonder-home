-- Developer platform (story 18-008): scoped partner keys and a sandbox.
--
-- A key belongs to one household, is created by an Admin, and is shown in full
-- exactly once: only its SHA-256 hash is kept, with a short prefix so a person
-- can tell their keys apart. Scopes only narrow what a key may do; a sandbox
-- key reads fixtures and writes nothing. Like the webhook tables (18-007), the
-- table is the server's alone: every read and write goes through the server,
-- which checks the Admin first, so no session — an Admin's included — reaches
-- a hash.
create table public.developer_api_keys (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  environment text not null check (environment in ('sandbox', 'live')),
  key_prefix text not null check (key_prefix ~ '^whk_(test|live)_[A-Za-z0-9]{4}$'),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null check (
    cardinality(scopes) between 1 and 3
    and scopes <@ array['household.read', 'groceries.read', 'groceries.write']::text[]
  ),
  created_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint developer_api_keys_expiry_after_creation check (expires_at is null or expires_at > created_at)
);

comment on table public.developer_api_keys is
  'Partner API keys (story 18-008): one household each, hashed, scoped, revocable. Server-only.';

create index developer_api_keys_household on public.developer_api_keys (household_id, created_at desc);

alter table public.developer_api_keys enable row level security;

-- Server-only, in the repo's usual shape: a policy that lets no session through.
create policy developer_api_keys_no_client_access
  on public.developer_api_keys for all
  to anon, authenticated
  using (false)
  with check (false);

notify pgrst, 'reload schema';

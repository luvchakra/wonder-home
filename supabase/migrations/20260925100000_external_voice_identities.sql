-- Voice integration phase 2: external voice identities, account linking and
-- the grants behind them (design/voice-integration/02-external-voice-
-- identity-and-auth.md).
--
-- An Amazon or Google identity is never a WonderHome identity. It becomes
-- one member's voice only when that member, signed in to WonderHome, links it
-- — and then only with the scopes they chose. Everything a linked voice asks
-- afterwards runs as that member under their own RLS, through HomeTalk.
--
-- external_voice_identities: one link — which member, which provider, which
-- scopes, and whether it is still active. The member and the household's
-- admins can see it; nobody can create or widen one from a browser. The
-- server creates it after consent, and a person only ever revokes it,
-- through public.revoke_voice_identity. Revoking keeps the row, so the
-- record of what was linked when is not lost, and deletes no household data.
--
-- voice_oauth_grants: the authorization codes and access/refresh tokens
-- WonderHome issues as the OAuth server a provider links through (Alexa
-- account linking). Only a SHA-256 hash of each is stored — the token itself
-- exists only in the provider's hands — and no session can read the table.

create table public.external_voice_identities (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null references public.household_members (id) on delete cascade,
  provider text not null check (provider in ('gemini', 'amazon_alexa')),
  -- The provider's own id for the account, once it is known. Never trusted
  -- as authorization on its own.
  provider_subject text check (provider_subject is null or length(provider_subject) between 1 and 300),
  device_name text check (device_name is null or length(device_name) between 1 and 80),
  status text not null default 'active' check (status in ('active', 'revoked')),
  scopes text[] not null default '{}' check (
    scopes <@ array[
      'household.read', 'calendar.read', 'meals.read', 'groceries.read', 'groceries.write',
      'school.read', 'bills.read', 'health.read', 'health.write', 'home.read', 'home.write',
      'pets.read', 'notifications.create'
    ]::text[]
  ),
  linked_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'revoked') = (revoked_at is not null))
);

comment on table public.external_voice_identities is
  'Voice phase 2: an external voice account (Alexa, Gemini Voice) linked to one member, with the scopes they chose. Created by the server after consent; revoked through public.revoke_voice_identity.';

create index external_voice_identities_member on public.external_voice_identities (household_id, member_id);
create unique index external_voice_identities_active_subject
  on public.external_voice_identities (provider, provider_subject)
  where status = 'active' and provider_subject is not null;

alter table public.external_voice_identities enable row level security;

-- The member sees their own links; the household's admins see every link in
-- the household. No session inserts, updates or deletes one directly.
create policy external_voice_identities_select_own_or_admin
  on public.external_voice_identities for select
  to authenticated
  using (member_id = wh.member_id(household_id) or wh.is_household_admin(household_id));

create or replace function wh.assert_voice_identity_member_in_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.household_members m
    where m.id = new.member_id and m.household_id = new.household_id
  ) then
    raise exception 'external_voice_identities: member % is not in household %', new.member_id, new.household_id
      using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger external_voice_identities_member_in_household
  before insert or update on public.external_voice_identities
  for each row execute function wh.assert_voice_identity_member_in_household();

create table public.voice_oauth_grants (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  identity_id uuid not null references public.external_voice_identities (id) on delete cascade,
  kind text not null check (kind in ('code', 'access', 'refresh')),
  -- SHA-256 of the code or token, hex. The value itself is never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  client_id text not null check (length(client_id) between 1 and 200),
  -- A code only: where it may be redeemed, and its PKCE challenge.
  redirect_uri text check (redirect_uri is null or length(redirect_uri) <= 2000),
  code_challenge text check (code_challenge is null or code_challenge ~ '^[A-Za-z0-9_-]{43,128}$'),
  code_challenge_method text check (code_challenge_method is null or code_challenge_method in ('S256')),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.voice_oauth_grants is
  'Voice phase 2: OAuth codes and tokens WonderHome issued to a voice provider, stored only as SHA-256 hashes. Service role only.';

create index voice_oauth_grants_identity on public.voice_oauth_grants (identity_id);
create index voice_oauth_grants_expiry on public.voice_oauth_grants (expires_at);

alter table public.voice_oauth_grants enable row level security;

create policy voice_oauth_grants_no_client_access
  on public.voice_oauth_grants for all
  to anon, authenticated
  using (false)
  with check (false);

-- Revoking a link: the member whose voice it is, or a household admin. It
-- stops every token at once and keeps the record; household data is untouched.
create or replace function wh.revoke_voice_identity(p_identity_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_identity public.external_voice_identities%rowtype;
begin
  select * into v_identity from public.external_voice_identities where id = p_identity_id;
  if not found then
    return false;
  end if;
  -- coalesce: for a caller outside the household wh.member_id is null, and
  -- `not (null or false)` is null, which an IF treats as "allowed".
  if not coalesce(v_identity.member_id = wh.member_id(v_identity.household_id) or wh.is_household_admin(v_identity.household_id), false) then
    raise exception 'not allowed to revoke this voice link' using errcode = '42501';
  end if;
  if v_identity.status = 'revoked' then
    return true;
  end if;
  update public.external_voice_identities
    set status = 'revoked', revoked_at = now()
    where id = p_identity_id;
  update public.voice_oauth_grants
    set revoked_at = now()
    where identity_id = p_identity_id and revoked_at is null;
  return true;
end;
$$;

create or replace function public.revoke_voice_identity(p_identity_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select wh.revoke_voice_identity(p_identity_id);
$$;

revoke all on function wh.revoke_voice_identity(uuid) from public, anon;
revoke all on function public.revoke_voice_identity(uuid) from public, anon;
grant execute on function wh.revoke_voice_identity(uuid) to authenticated;
grant execute on function public.revoke_voice_identity(uuid) to authenticated, service_role;

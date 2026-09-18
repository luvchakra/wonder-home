-- A household's own model key (bring your own key).
--
-- Applied to the wonder-home Supabase project as version 20260919090000.
--
-- This table is a deliberate exception to a rule this codebase otherwise
-- holds firmly. The connector framework says a table that can hold a
-- provider token eventually does, and so `integrations.credential_ref` names
-- where a secret lives rather than holding one. Bring-your-own-key cannot
-- work that way: a household typing their own Anthropic key into a settings
-- page has nowhere else to put it, and sending them to a secret manager
-- would mean nobody ever uses the feature.
--
-- So the key is stored, and the exception is paid for in three ways:
--
--   1. There is no SELECT policy. Not a narrow one — none at all. No session,
--      however privileged, can read a key back out through PostgREST. The
--      server reads it with the service role, which never reaches a browser.
--   2. Whether a key is set is answered by a function that returns the
--      provider and a timestamp and never the key, so the settings screen can
--      say "configured" without the value passing through it.
--   3. Only a household administrator may write one, and the member who did
--      it is recorded.
--
-- The better future is still `credential_ref` pointing at a secret manager.
-- When that exists, this table becomes a pointer and the exception ends.

create table public.household_ai_credentials (
  household_id uuid primary key references public.households(id) on delete cascade,
  provider text not null default 'anthropic'
    check (provider in ('anthropic', 'google', 'openai')),
  api_key text not null check (length(trim(api_key)) between 20 and 300),
  set_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.household_ai_credentials is
  'A household''s own model key. Deliberately has no SELECT policy: the server reads it with the service role and nothing else can read it at all.';

alter table public.household_ai_credentials enable row level security;

create trigger household_ai_credentials_set_updated_at
  before update on public.household_ai_credentials
  for each row execute function wh.set_updated_at();

create trigger household_ai_credentials_member_valid
  before insert or update on public.household_ai_credentials
  for each row execute function wh.assert_meal_member_in_household('set_by_member_id');

-- Writing is an administrator's act. Reading is nobody's: there is no select
-- policy here on purpose, so a key can be set and replaced but never fetched.
create policy household_ai_credentials_write_admin on public.household_ai_credentials for all
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

/**
 * Whether this household has its own key, without ever returning it.
 *
 * The settings screen needs to say "your household's key is in use, set on
 * the 4th" and nothing more. This returns exactly that much.
 */
create or replace function public.ai_credential_status(p_household_id uuid)
returns table (configured boolean, provider text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    true,
    c.provider,
    c.updated_at
  from public.household_ai_credentials c
  where c.household_id = p_household_id
    and wh.is_member(p_household_id);
$$;

comment on function public.ai_credential_status is
  'Whether a household has its own model key, and since when. Never returns the key.';

revoke all on function public.ai_credential_status(uuid) from public, anon;
grant execute on function public.ai_credential_status(uuid) to authenticated;

notify pgrst, 'reload schema';

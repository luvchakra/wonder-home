-- A household's own Gemini voice key, separate from its assistant key.
--
-- `household_ai_credentials` holds one key per household, the one HomeTalk
-- and HomeBrain think with. Gemini Live voice can only ever run on Google's
-- servers, so until now a household that chose Anthropic (or OpenAI) for its
-- assistant could not use Gemini voice at all. This second, optional key is
-- for voice alone: Google only, never used to understand or answer anything
-- outside a Gemini Live session.
--
-- Same three protections as the assistant key: no SELECT policy at all (the
-- server reads it with the service role), a status function that never
-- returns the key, and only an Admin may set or remove it.

create table public.household_gemini_voice_credentials (
  household_id uuid primary key references public.households(id) on delete cascade,
  provider text not null default 'google' check (provider = 'google'),
  api_key text not null check (length(trim(api_key)) between 20 and 300),
  set_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.household_gemini_voice_credentials is
  'A household''s own Google key for Gemini Live voice only. No SELECT policy: the server reads it with the service role and nothing else can read it.';

alter table public.household_gemini_voice_credentials enable row level security;

create trigger household_gemini_voice_credentials_set_updated_at
  before update on public.household_gemini_voice_credentials
  for each row execute function wh.set_updated_at();

create trigger household_gemini_voice_credentials_member_valid
  before insert or update on public.household_gemini_voice_credentials
  for each row execute function wh.assert_meal_member_in_household('set_by_member_id');

create policy household_gemini_voice_credentials_write_admin on public.household_gemini_voice_credentials for all
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

create or replace function public.gemini_voice_credential_status(p_household_id uuid)
returns table (configured boolean, provider text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select true, c.provider, c.updated_at
  from public.household_gemini_voice_credentials c
  where c.household_id = p_household_id
    and wh.is_member(p_household_id);
$$;

comment on function public.gemini_voice_credential_status is
  'Whether a household has its own Gemini voice key, and since when. Never returns the key.';

revoke all on function public.gemini_voice_credential_status(uuid) from public, anon;
grant execute on function public.gemini_voice_credential_status(uuid) to authenticated;

notify pgrst, 'reload schema';


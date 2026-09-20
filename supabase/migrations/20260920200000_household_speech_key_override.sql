/**
 * A household may bring its own speech key (story 04-009, revised again).
 *
 * The deployment's key stays the default, so a family gets a voice that
 * understands them with nothing to set up. A household that would rather
 * use their own Google Cloud project — their billing, their quotas, their
 * agreement with Google — sets one here, and theirs wins.
 *
 * Same bargain as `household_ai_credentials`, and the same protection: no
 * SELECT policy at all, so the key can be set and replaced by an
 * administrator and read back by nobody, including the household that set
 * it. The server reads it with the service role and nowhere else.
 */

create table public.household_voice_credentials (
  household_id uuid primary key references public.households(id) on delete cascade,
  provider text not null default 'google' check (provider in ('google')),
  api_key text not null check (length(trim(api_key)) between 20 and 300),
  set_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.household_voice_credentials is
  'A household''s own Google Cloud Speech key, overriding the deployment''s. Deliberately has no SELECT policy: the server reads it with the service role and nothing else can read it at all.';

alter table public.household_voice_credentials enable row level security;

create trigger household_voice_credentials_set_updated_at
  before update on public.household_voice_credentials
  for each row execute function wh.set_updated_at();

create trigger household_voice_credentials_member_valid
  before insert or update on public.household_voice_credentials
  for each row execute function wh.assert_meal_member_in_household('set_by_member_id');

create policy household_voice_credentials_write_admin on public.household_voice_credentials for all
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

/** Whether this household has its own speech key, and since when. Never the key. */
create or replace function public.voice_credential_status(p_household_id uuid)
returns table (configured boolean, provider text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select true, c.provider, c.updated_at
  from public.household_voice_credentials c
  where c.household_id = p_household_id
    and wh.is_member(p_household_id);
$$;

revoke all on function public.voice_credential_status(uuid) from public, anon;
grant execute on function public.voice_credential_status(uuid) to authenticated;

-- Speech now works out of the box on a deployment that has a key, so the
-- default stops being the browser's own voice.
alter table public.household_voice_settings alter column provider set default 'google';

notify pgrst, 'reload schema';

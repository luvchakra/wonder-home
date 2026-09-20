/**
 * A household's voice: how WonderHome speaks, and how it listens (story 04-009).
 *
 * Two tables, deliberately separate, because they are read by different
 * people for different reasons:
 *
 *   household_voice_settings    — preferences. Every member may read them,
 *                                 because the assistant screen needs them to
 *                                 render; an administrator may change them.
 *   household_voice_credentials — the Google API key. No SELECT policy at
 *                                 all, exactly as household_ai_credentials
 *                                 does it: the server reads the key with the
 *                                 service role and nothing else can read it,
 *                                 including the household that set it.
 *
 * Ranges are checked here as well as in Zod. The server is authoritative
 * (SECURITY-BASELINE.md), and a pitch of 400 semitones should be refused by
 * the database even if some future caller forgets to validate.
 */

create table public.household_voice_settings (
  household_id uuid primary key references public.households(id) on delete cascade,

  provider text not null default 'browser'
    check (provider in ('browser', 'google')),

  -- What it sounds like.
  language text not null default 'en-IN' check (length(trim(language)) between 2 and 20),
  voice_name text check (voice_name is null or length(trim(voice_name)) between 1 and 80),
  gender text not null default 'male' check (gender in ('male', 'female', 'any')),
  tier text not null default 'wavenet'
    check (tier in ('standard', 'wavenet', 'neural2', 'studio', 'chirp3-hd')),
  speaking_rate numeric(4, 2) not null default 1.00 check (speaking_rate between 0.25 and 4.00),
  pitch numeric(4, 1) not null default 0.0 check (pitch between -20.0 and 20.0),
  volume_gain_db numeric(4, 1) not null default 0.0 check (volume_gain_db between -96.0 and 16.0),
  listening_device text not null default 'none'
    check (listening_device in ('none', 'handset', 'headphones', 'small-speaker', 'smart-speaker', 'car', 'wearable')),
  speak_replies boolean not null default true,

  -- How it listens.
  recognition_language text check (recognition_language is null or length(trim(recognition_language)) between 2 and 20),
  alternative_languages text[] not null default '{}'::text[]
    check (array_length(alternative_languages, 1) is null or array_length(alternative_languages, 1) <= 3),
  recognition_model text not null default 'latest_short'
    check (recognition_model in ('latest_long', 'latest_short', 'command_and_search', 'chirp')),
  automatic_punctuation boolean not null default true,
  profanity_filter boolean not null default false,
  phrase_hints text[] not null default '{}'::text[]
    check (array_length(phrase_hints, 1) is null or array_length(phrase_hints, 1) <= 50),
  enhanced_recognition boolean not null default true,

  updated_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.household_voice_settings is
  'How WonderHome speaks and listens for one household. Preferences only: whether voice runs at all is the conversation.voice entitlement.';

alter table public.household_voice_settings enable row level security;

create trigger household_voice_settings_set_updated_at
  before update on public.household_voice_settings
  for each row execute function wh.set_updated_at();

create trigger household_voice_settings_member_valid
  before insert or update on public.household_voice_settings
  for each row execute function wh.assert_meal_member_in_household('updated_by_member_id');

-- Any member reads: the assistant needs these to speak at all. Only an
-- administrator changes them, because a voice is a household-wide decision.
create policy household_voice_settings_read on public.household_voice_settings for select
  to authenticated
  using (wh.is_member(household_id));

create policy household_voice_settings_write_admin on public.household_voice_settings for all
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

create table public.household_voice_credentials (
  household_id uuid primary key references public.households(id) on delete cascade,
  provider text not null default 'google' check (provider in ('google')),
  api_key text not null check (length(trim(api_key)) between 20 and 300),
  set_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.household_voice_credentials is
  'A household''s own Google Cloud Speech key. Deliberately has no SELECT policy: the server reads it with the service role and nothing else can read it at all.';

alter table public.household_voice_credentials enable row level security;

create trigger household_voice_credentials_set_updated_at
  before update on public.household_voice_credentials
  for each row execute function wh.set_updated_at();

create trigger household_voice_credentials_member_valid
  before insert or update on public.household_voice_credentials
  for each row execute function wh.assert_meal_member_in_household('set_by_member_id');

-- Writing is an administrator's act. Reading is nobody's.
create policy household_voice_credentials_write_admin on public.household_voice_credentials for all
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

/**
 * Whether this household has a speech key, without ever returning it.
 *
 * The settings screen says "your Google key is in use, set on the 4th" and
 * nothing more, the same bargain `ai_credential_status` strikes.
 */
create or replace function public.voice_credential_status(p_household_id uuid)
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
  from public.household_voice_credentials c
  where c.household_id = p_household_id
    and wh.is_member(p_household_id);
$$;

comment on function public.voice_credential_status is
  'Whether a household has its own speech key, and since when. Never returns the key.';

revoke all on function public.voice_credential_status(uuid) from public, anon;
grant execute on function public.voice_credential_status(uuid) to authenticated;

notify pgrst, 'reload schema';

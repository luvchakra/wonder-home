-- Language, region, currency, time and units (story 22-001/22-002/22-003).
--
-- Five separate preferences, kept separate:
--   * the household decides where it is and what its money is in — region,
--     default currency, time zone (already here), default measurement system
--     and default language — and only an Admin changes those, through the
--     existing households_update_admin policy;
--   * each person decides how WonderHome speaks to them — language, how a
--     date and a time are written, metric or imperial — through the existing
--     member policies (themselves, or an Admin; the self-update guard already
--     keeps a member from touching anything but their own presentation).
--
-- Nothing here converts or rewrites a record. The household currency is the
-- default for new money only; every existing amount keeps its own currency.

alter table public.households
  add column region text check (region is null or region ~ '^[A-Z]{2}$'),
  add column currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  add column measurement_system text check (measurement_system in ('metric', 'imperial')),
  add column default_language text check (default_language is null or default_language ~ '^[a-z]{2,3}$');

comment on column public.households.region is
  'ISO 3166 country the household lives in. Suggests conventions; never overrides a choice.';
comment on column public.households.currency is
  'ISO 4217 default for new money records. Existing records keep their own currency; nothing is converted.';
comment on column public.households.default_language is
  'Language for anyone in the household who has not chosen their own.';

alter table public.household_members
  add column language text check (language is null or language ~ '^[a-z]{2,3}$'),
  add column date_format text check (date_format in ('dmy', 'mdy', 'ymd')),
  add column time_format text check (time_format in ('12h', '24h')),
  add column measurement_system text check (measurement_system in ('metric', 'imperial')),
  -- Where this person is in the optional "how should WonderHome speak to you"
  -- setup. Null means never offered; skipped is a decision, and is kept.
  add column locale_setup_status text check (locale_setup_status in ('in_progress', 'skipped', 'completed')),
  add column locale_setup_step text check (locale_setup_step is null or locale_setup_step in ('intro', 'language', 'region', 'currency', 'datetime', 'review')),
  add column locale_setup_version smallint check (locale_setup_version is null or locale_setup_version between 1 and 100),
  add column locale_setup_at timestamptz,
  -- The Home card inviting someone to set this up, put away for good.
  add column locale_prompt_dismissed_at timestamptz;

comment on column public.household_members.language is
  'The language WonderHome speaks to this person in. Presentation only — no record is stored translated.';

-- Setup events: the localization steps join the closed list, and a member
-- may record their own (their preferences are theirs to set); the rest stay
-- Admin-only as before.
alter table public.onboarding_events drop constraint onboarding_events_event_check;
alter table public.onboarding_events add constraint onboarding_events_event_check check (event in (
  'onboarding_started', 'household_composition_completed', 'member_added', 'pet_added', 'helper_added',
  'responsibility_suggestions_generated', 'responsibility_accepted', 'responsibility_modified',
  'responsibility_rejected', 'ai_setup_started', 'ai_question_answered', 'setup_deferred',
  'setup_resumed', 'setup_completed', 'first_use_after_onboarding',
  'localization_setup_started', 'language_selected', 'region_selected', 'currency_selected',
  'timezone_selected', 'measurement_system_selected', 'localization_setup_completed',
  'localization_setup_skipped', 'localization_setup_resumed', 'language_changed', 'currency_changed',
  'timezone_changed', 'member_language_changed'
));

drop policy onboarding_events_insert_admin on public.onboarding_events;
create policy onboarding_events_insert
  on public.onboarding_events for insert
  to authenticated
  with check (
    wh.is_household_admin(household_id)
    or (
      wh.is_member(household_id)
      and event in (
        'localization_setup_started', 'language_selected', 'region_selected', 'currency_selected',
        'timezone_selected', 'measurement_system_selected', 'localization_setup_completed',
        'localization_setup_skipped', 'localization_setup_resumed', 'language_changed'
      )
    )
  );

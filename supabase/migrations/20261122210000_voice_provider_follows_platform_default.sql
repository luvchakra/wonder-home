-- Voice works out of the box (owner, 2026-11-22): a household that never chose
-- a speech provider follows WonderHome's platform default (Platform admin →
-- Voice and Alexa → Default speech provider), resolved at read time in
-- packages/core/src/voice/defaults.ts.
--
-- "Never chose" needs a value of its own: null. No existing row is rewritten;
-- a provider a household saved stays its answer.
--
-- Safe in either order:
--  * migration first: the deployed code always writes a provider, so nothing
--    stores null until the new code ships;
--  * code first: the new code writes null only for "Default (from WonderHome)",
--    and on 23502 (this column still NOT NULL) writes the resolved default
--    instead, exactly what the household hears today; it reads null as
--    "never chose".
alter table public.household_voice_settings alter column provider drop not null;
alter table public.household_voice_settings alter column provider set default null;

comment on column public.household_voice_settings.provider is
  'The speech provider this household chose: google or browser. Null = never chose: WonderHome''s platform default applies (WONDERHOME_VOICE_PROVIDER_DEFAULT), resolved at read time.';

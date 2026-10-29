-- Per-member live-conversation engine (voice phase 3 follow-up, 2026-10-29).
--
-- Who a person talks to in a live conversation — WonderHome's own listen/
-- speak loop, or Gemini Live calling HomeTalk's tools — was stored in two
-- places that could disagree. The HomeTalk composer kept it in the browser's
-- own localStorage (per device, per member); Settings -> Voice read and wrote
-- the household-wide default on household_voice_settings.live_engine. A member
-- who switched engines in the composer saw Settings still showing the old one,
-- and the two never reconciled (the owner, 2026-10-29).
--
-- This makes the choice a real per-member preference, server-side, the same
-- shape as the localization preferences already on this table: a nullable
-- column that, when null, follows the household default. Both the composer and
-- the Voice settings page now read and write this one value, so they cannot
-- drift, and it survives a change of device. The household default stays on
-- household_voice_settings.live_engine as the seed a member inherits before
-- they choose.
--
-- Safe in either order with the deploy: the column is nullable, with no
-- backfill and no default change, and every reader treats a missing or null
-- value as "follow the household default" (packages/core/src/voice/repository
-- reads it defensively and returns null if the column is absent), so code that
-- predates this migration is unaffected and code that follows it degrades to
-- the household default until the column exists.
--
-- No new RLS: household_members already lets a member update their own row
-- (household_members_update_self) and an Admin update anyone's
-- (household_members_update_admin), and wh.guard_member_self_update() locks
-- only household_id/member_type/status/profile_id, so a member may set their
-- own engine and only an Admin may set another member's. No index: the column
-- is only ever read by the member's own primary key, never filtered or joined.

alter table public.household_members
  add column live_engine text
    check (live_engine is null or live_engine in ('wonderhome', 'gemini_live'));

comment on column public.household_members.live_engine is
  'Which engine THIS member talks to in a live conversation: wonderhome (HomeTalk turns) or gemini_live (Gemini Live calling HomeTalk tools). Null follows the household default (household_voice_settings.live_engine). A personal preference, self-editable; availability is re-checked server-side on every session.';

/*
 * Gemini Voice (voice integration phase 3): which engine runs a live,
 * hands-free conversation in the app.
 *
 *   wonderhome   — WonderHome listens and speaks itself (the browser's
 *                  voice or the household's speech service) and every turn
 *                  is a HomeTalk turn. The default, and what every existing
 *                  household keeps.
 *   gemini_live  — Google's Gemini Live API listens and speaks, and may only
 *                  reach the household through HomeTalk's allowlisted tools.
 *                  Offered only where the household's AI key is Google's and
 *                  its data-use agreement lets content go to Google; checked
 *                  again on every session and every tool call, so this column
 *                  is a preference, never a permission.
 *
 * A preference like the rest of the row: the existing RLS (members read, an
 * Admin writes) covers it unchanged.
 */
alter table public.household_voice_settings
  add column live_engine text not null default 'wonderhome'
    check (live_engine in ('wonderhome', 'gemini_live'));

comment on column public.household_voice_settings.live_engine is
  'Which engine runs live conversation: wonderhome (HomeTalk turns) or gemini_live (Gemini Live API calling HomeTalk tools). A preference; availability is re-checked server-side.';

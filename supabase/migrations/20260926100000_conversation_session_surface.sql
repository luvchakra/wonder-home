/*
 * Voice integration phase 5: a conversation belongs to the surface it
 * happens on.
 *
 * Until now a member had one open session whatever they talked through, so
 * "which one?" said to Alexa in the kitchen could be read as the answer to a
 * question the app asked an hour earlier — or approve the app's proposal.
 * The spec (design/voice-integration/05-unified-voice-ux-and-capabilities.md,
 * "Cross-channel continuity") is explicit: household truth is shared,
 * conversation state is not.
 *
 *   app    — the web and PWA composer, and Gemini Voice inside the app: one
 *            screen, one conversation the member can scroll back through.
 *   alexa  — a linked Alexa speaker: its own questions, its own proposals.
 *
 * Every existing session is the app's, which is where every one of them
 * happened. RLS is unchanged: a session is still its member's alone.
 */
alter table public.conversation_sessions
  add column surface text not null default 'app'
    check (surface in ('app', 'alexa'));

comment on column public.conversation_sessions.surface is
  'Where the conversation happens: app (web, PWA, in-app Gemini Voice) or alexa. Pending questions and proposals never cross surfaces; household data is shared.';

create index conversation_sessions_open_surface_idx
  on public.conversation_sessions (member_id, surface, created_at desc)
  where status = 'open';
